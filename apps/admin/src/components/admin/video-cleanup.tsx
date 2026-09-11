"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@ttokttok/ui/components/button';
import { videoUploadRequest } from '@/lib/video-upload';

export function VideoCleanup({ id }: { id: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  return <div className="flex flex-col gap-2">
    <Button type="button" variant="outline" disabled={busy} onClick={async () => {
      if (!window.confirm('게시물에서 사용하지 않는 영상 파일을 삭제합니다. 필요한 백업을 확인했나요?')) return;
      setBusy(true); setError('');
      try { await videoUploadRequest({ action: 'cleanup', id }); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : '삭제에 실패했습니다.'); }
      finally { setBusy(false); }
    }}>{busy ? '정리 중' : '미사용 파일 삭제'}</Button>
    {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
  </div>;
}
