"use client";

import { useEffect, useRef, useState } from "react";
import Image from 'next/image';
import { Button } from "@ttokttok/ui/components/button";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import { readVideoBundle, uploadVideoFiles, videoUploadRequest } from "@/lib/video-upload";
import type { VideoController } from "@ttokttok/ui/media/hls-controller";
import type { VideoManifest } from "@ttokttok/shared/video-bundle";

function Preview({ base, renditions }: { base: string; renditions: VideoManifest['renditions'] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const controller = useRef<VideoController | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    const video = ref.current!;
    import('@ttokttok/ui/media/hls-controller').then(({ attachHls }) => {
      if (disposed) return;
      controller.current = attachHls(video, { hls: `${base}/master.m3u8`, fallback: `${base}/fallback.mp4`, active: true,
        qualities: renditions.map(r => `${base}/${r.playlist}`),
        onReady: () => {}, onError: () => setError(true) });
    }).catch(() => setError(true));
    return () => { disposed = true; controller.current?.destroy(); controller.current = null; };
  }, [base, renditions]);
  return <div className="flex flex-col gap-2">
    <video ref={ref} controls playsInline muted poster={`${base}/poster.jpg`} className="max-h-96 w-full rounded-md bg-muted" />
    <Label>미리보기 화질
      <select className="border-input bg-background ml-2 min-h-11 rounded-md border px-3" defaultValue="-1" onChange={e => controller.current?.setQuality(Number(e.target.value))}>
        <option value="-1">자동</option>{renditions.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
      </select>
    </Label>
    {error ? <p role="alert">미리보기 재생에 실패했습니다.</p> : null}
  </div>;
}

export function VideoBundleField({ existing, onReadyChange }: { existing: boolean; onReadyChange: (ready: boolean) => void }) {
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof readVideoBundle>> | null>(null);
  const [session, setSession] = useState<{ id: string; base: string } | null>(null);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [progress, setProgress] = useState(0);
  const [poster, setPoster] = useState<string | null>(null);
  const completed = useRef(new Set<string>()), abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => { if (poster) URL.revokeObjectURL(poster); }, [poster]);
  const total = bundle?.manifest.files.reduce((n, f) => n + f.size, 0) ?? 0;
  async function upload() {
    if (!bundle) return;
    setBusy(true); setError(''); onReadyChange(false);
    const control = new AbortController(); abort.current = control;
    try {
      const current = session ?? await videoUploadRequest({ action: 'start', manifest: bundle.manifest });
      setSession(current);
      await uploadVideoFiles({ id: current.id, ...bundle, completed: completed.current, signal: control.signal, onProgress: setProgress });
      if (control.signal.aborted) throw new Error('업로드를 중단했습니다.');
      await videoUploadRequest({ action: 'complete', id: current.id });
      setReady(true); onReadyChange(true);
    } catch (e) { setError(e instanceof Error ? e.message : '업로드에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-3">
    <Label htmlFor="video-bundle">변환한 영상 ZIP</Label>
    <Input id="video-bundle" type="file" accept=".zip,application/zip" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0];
      setBundle(null); setSession(null); setReady(false); setError(''); setProgress(0); setPoster(null); completed.current = new Set();
      onReadyChange(!file && existing);
      if (!file) return;
      setBusy(true);
      try {
        const parsed = await readVideoBundle(file);
        setBundle(parsed);
        setPoster(URL.createObjectURL(new Blob([new Uint8Array(parsed.bytes[parsed.manifest.poster])], { type: 'image/jpeg' })));
      } catch (e) { setError(e instanceof Error ? e.message : '파일을 확인하지 못했습니다.'); }
      finally { setBusy(false); }
    }} />
    <input type="hidden" name="video_upload_id" value={ready ? session?.id ?? '' : ''} />
    <p className="text-muted-foreground text-xs">PC 변환 도구에서 만든 ZIP 하나를 선택하세요. 화질별로 따로 올릴 필요가 없습니다.{existing ? ' 새 파일을 선택하지 않으면 현재 영상을 유지합니다.' : ''}</p>
    {bundle ? <>
      <p className="text-sm">{bundle.manifest.renditions.map(r => r.label).join(' · ')} · {Math.ceil(bundle.manifest.duration)}초 · {(total / 1024 / 1024).toFixed(1)}MB</p>
      {!ready && poster ? <Image unoptimized src={poster} alt="영상 첫 화면" sizes="(max-width: 640px) 100vw, 640px" width={bundle.manifest.renditions[0].width} height={bundle.manifest.renditions[0].height} className="max-h-64 w-full rounded-md object-contain" /> : null}
      <progress aria-label="영상 업로드 진행률" value={progress} max={total} className="w-full" />
      <p role="status" className="text-sm">{ready ? '업로드 확인 완료. 발행하거나 임시저장하세요.' : `${Math.round(progress / total * 100)}% 업로드${busy && progress === total ? ' · 파일 확인 중' : ''}`}</p>
      {!ready && !busy ? <Button type="button" variant="secondary" onClick={upload}>{session ? '실패한 파일 이어 올리기' : '영상 업로드'}</Button> : null}
      {busy ? <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>업로드 중단</Button> : null}
      {ready && session ? <Preview base={session.base} renditions={bundle.manifest.renditions} /> : null}
    </> : null}
    {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
    <a href="/admin/videos" className="text-muted-foreground text-xs underline">업로드 기록과 미사용 파일 관리</a>
  </div>;
}
