import { z } from "zod";

export const VIDEO_FILE_LIMIT = 50 * 1024 * 1024;
export const VIDEO_BUNDLE_LIMIT = 512 * 1024 * 1024;
const path = z.string().regex(/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:m3u8|ts|mp4|jpg)$/);
export const videoManifestSchema = z.object({
  version: z.literal(1),
  duration: z.number().positive().max(600),
  master: z.literal("master.m3u8"),
  fallback: z.literal("fallback.mp4"),
  poster: z.literal("poster.jpg"),
  renditions: z.array(z.object({
    label: z.string().regex(/^\d+p$/), width: z.number().int().positive(),
    height: z.number().int().positive(), bandwidth: z.number().int().positive(), playlist: path,
  }).strict()).min(1).max(3),
  files: z.array(z.object({ path, size: z.number().int().positive().max(VIDEO_FILE_LIMIT) }).strict()).min(4).max(1500),
}).strict();
export type VideoManifest = z.infer<typeof videoManifestSchema>;

export function parseVideoManifest(value: unknown): VideoManifest {
  const parsed = videoManifestSchema.safeParse(value);
  if (!parsed.success) throw new Error("영상 묶음의 형식이나 파일 크기가 올바르지 않습니다. PC 변환 도구에서 다시 만들어 주세요.");
  const m = parsed.data;
  const names = new Set(m.files.map(f => f.path));
  if (names.size !== m.files.length) throw new Error("중복 파일이 있습니다.");
  if (m.files.reduce((n, f) => n + f.size, 0) > VIDEO_BUNDLE_LIMIT) throw new Error("묶음은 512MB 이하여야 합니다.");
  for (const name of [m.master, m.fallback, m.poster, ...m.renditions.map(r => r.playlist)]) {
    if (!names.has(name)) throw new Error(`필수 파일 누락: ${name}`);
  }
  return m;
}

/** Only the unencrypted, local TS playlists produced by our converter are accepted. */
export function validateVideoPlaylist(name: string, text: string, m: VideoManifest) {
  if (!text.startsWith("#EXTM3U") || text.length > 256000) throw new Error(`잘못된 재생 목록: ${name}`);
  const allowed = new Set(m.files.map(f => f.path));
  const directory = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
  let refs = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (/URI\s*=|#EXT-X-(KEY|MAP|BYTERANGE|SESSION|DEFINE|PART|PRELOAD|RENDITION-REPORT)/i.test(line)) throw new Error("지원하지 않는 재생 목록 참조입니다.");
      continue;
    }
    const ext = name === m.master ? "m3u8" : "ts";
    if (!new RegExp(`^[a-z0-9_-]+(?:/[a-z0-9_-]+)*\\.${ext}$`).test(line) || !allowed.has(directory + line)) {
      throw new Error(`외부 주소 또는 누락된 파일: ${line}`);
    }
    refs++;
  }
  if (!refs || (name !== m.master && !text.includes("#EXT-X-ENDLIST"))) throw new Error("완료되지 않은 재생 목록입니다.");
}

export function videoContentType(path: string) {
  return path.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : path.endsWith(".ts") ? "video/mp2t" : path.endsWith(".jpg") ? "image/jpeg" : "video/mp4";
}
