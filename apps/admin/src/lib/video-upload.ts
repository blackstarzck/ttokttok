import { unzip } from "fflate";
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { parseVideoManifest, validateVideoPlaylist, videoContentType, VIDEO_BUNDLE_LIMIT, VIDEO_FILE_LIMIT, type VideoManifest } from "@ttokttok/shared/video-bundle";

/** ZIP·브라우저 변환 두 경로가 같은 검증을 탄다 — manifest·파일 목록·재생 목록. */
export function validateBundleFiles(bytes: Record<string, Uint8Array>) {
  if (!bytes['manifest.json'] || bytes['manifest.json'].length > 512000) throw new Error("변환 도구가 만든 ZIP 파일을 선택하세요.");
  let metadata: unknown;
  try { metadata = JSON.parse(new TextDecoder().decode(bytes['manifest.json'])); }
  catch { throw new Error('영상 묶음 정보가 손상되었습니다. PC 변환 도구에서 다시 만들어 주세요.'); }
  const manifest = parseVideoManifest(metadata);
  const allowed = new Set(['manifest.json', ...manifest.files.map(f => f.path)]);
  const names = Object.keys(bytes);
  if (names.length !== allowed.size || names.some(name => !allowed.has(name))) throw new Error("묶음에 허용되지 않는 파일이 있습니다.");
  for (const f of manifest.files) {
    if (bytes[f.path]?.length !== f.size) throw new Error(`파일 누락 또는 크기 불일치: ${f.path}`);
    if (f.path.endsWith('.m3u8')) validateVideoPlaylist(f.path, new TextDecoder().decode(bytes[f.path]), manifest);
  }
  return { manifest, bytes };
}

export async function readVideoBundle(file: File) {
  if (file.size > VIDEO_BUNDLE_LIMIT + 1024 * 1024) throw new Error("ZIP 파일은 512MB 이하여야 합니다.");
  let expanded = 0, entries = 0;
  const bytes = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    file.arrayBuffer().then(buffer => unzip(new Uint8Array(buffer), {
      filter(entry) {
        expanded += entry.originalSize; entries++;
        return entries <= 1501 && expanded <= VIDEO_BUNDLE_LIMIT + 512000 && entry.originalSize <= VIDEO_FILE_LIMIT;
      },
    }, (err, data) => err ? reject(new Error('ZIP 파일을 읽을 수 없습니다. PC 변환 도구에서 다시 만들어 주세요.')) : resolve(data))).catch(reject);
  });
  if (expanded > VIDEO_BUNDLE_LIMIT + 512000 || entries > 1501) throw new Error("압축 해제 크기가 제한을 초과했습니다.");
  return validateBundleFiles(bytes);
}

export async function videoUploadRequest(body: object) {
  const response = await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '영상 업로드 처리에 실패했습니다.');
  return data as { id: string; prefix: string; base: string };
}

export async function uploadVideoFiles(args: {
  id: string; manifest: VideoManifest; bytes: Record<string, Uint8Array>; completed: Set<string>;
  signal: AbortSignal; onProgress: (bytes: number) => void;
}) {
  const db = createClient();
  const progress = new Map(args.manifest.files.map(f => [f.path, args.completed.has(f.path) ? f.size : 0]));
  const report = () => args.onProgress([...progress.values()].reduce((n, b) => n + b, 0));
  const queue = args.manifest.files.filter(f => !args.completed.has(f.path));
  let firstError: unknown;
  const worker = async () => {
    while (queue.length && !args.signal.aborted && !firstError) {
      const file = queue.shift()!;
      try {
        const path = `bundles/${args.id}/${file.path}`;
        const blob = new Blob([new Uint8Array(args.bytes[file.path])], { type: videoContentType(file.path) });
        if (file.size > 6 * 1024 * 1024) {
          const { data: { session } } = await db.auth.getSession();
          if (!session) throw new Error('다시 로그인하세요.');
          await new Promise<void>((resolve, reject) => {
            const upload = new Upload(blob, {
              endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
              headers: { authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'x-upsert': 'true' },
              chunkSize: 6 * 1024 * 1024, retryDelays: [0, 1000, 3000, 5000],
              // Same-size files in different bundles must never resume each other's upload.
              fingerprint: async () => `ttokttok-video:${path}:${file.size}`,
              uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
              metadata: { bucketName: 'videos', objectName: path, contentType: blob.type, cacheControl: '31536000' },
              onProgress: loaded => { progress.set(file.path, loaded); report(); },
              onError: error => { args.signal.removeEventListener('abort', cancel); reject(error); },
              onSuccess: () => { args.signal.removeEventListener('abort', cancel); resolve(); },
            });
            const cancel = () => { void upload.abort().then(() => reject(new Error('업로드를 중단했습니다.'))); };
            args.signal.addEventListener('abort', cancel, { once: true });
            if (args.signal.aborted) { cancel(); return; }
            upload.findPreviousUploads().then(previous => {
              if (args.signal.aborted) return;
              if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
              upload.start();
            }).catch(reject);
          });
        } else {
          // Storage SDK doesn't expose cancellation for standard upload; use the same authenticated endpoint.
          const { data: { session } } = await db.auth.getSession();
          if (!session) throw new Error('다시 로그인하세요.');
          const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/videos/${path}`, {
            method: 'POST', signal: args.signal, body: blob,
            headers: { authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': blob.type, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' },
          });
          if (!response.ok) throw new Error(`파일 전송 실패 (${response.status}): ${file.path}`);
        }
        args.completed.add(file.path); progress.set(file.path, file.size); report();
      } catch (error) { firstError ??= error; }
    }
  };
  report();
  await Promise.all([worker(), worker(), worker()]);
  if (args.signal.aborted) throw new Error('업로드를 중단했습니다. 이어 올리기를 누르면 계속됩니다.');
  if (firstError) throw firstError;
}
