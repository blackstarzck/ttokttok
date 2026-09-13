import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { createClient } from '@/lib/supabase/server';
import { VideoCleanup } from '@/components/admin/video-cleanup';

export default async function VideosPage() {
  await requireAdmin();
  const db = await createClient();
  const { data, error } = await db.from('video_uploads')
    .select('id, created_at, status, post_videos(post_id), book_trailers(book_id)').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  // 사용처는 게시물 또는 트레일러 중 하나다 — RPC가 묶음을 한 곳에만 붙게 한다.
  const used = new Map<string, { label: string; href: string }>();
  for (const u of data ?? []) {
    if (u.post_videos.length > 0) used.set(u.id, { label: '게시물에서 사용 중', href: `/admin/posts/${u.post_videos[0].post_id}` });
    else if (u.book_trailers.length > 0) used.set(u.id, { label: '트레일러에서 사용 중', href: `/admin/books/${u.book_trailers[0].book_id}` });
  }
  return <div className="flex flex-col gap-6">
    <h1 className="text-xl font-bold">영상 업로드 기록</h1>
    <p className="text-muted-foreground text-sm">최근 100건입니다. 게시물이나 도서 트레일러에 연결된 영상은 삭제할 수 없습니다. 교체 전 영상은 백업과 새 영상 재생을 확인한 후 정리하세요.</p>
    <Link href="/admin/posts" className="underline">게시물 목록</Link>
    {!data?.length ? <p>업로드 기록이 없습니다.</p> : data.map(upload => {
      const use = used.get(upload.id);
      return <section key={upload.id} className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm">{new Date(upload.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {use ? use.label : upload.status === 'ready' ? '미사용 · 업로드 완료' : upload.status === 'deleting' ? '삭제 재시도 필요' : '미완료 업로드'}</p>
        <p className="text-muted-foreground break-all text-xs">{upload.id}</p>
        {use ? <Link href={use.href} className="underline">{use.label.startsWith('게시물') ? '게시물 확인' : '도서 확인'}</Link> : <VideoCleanup id={upload.id} />}
      </section>;
    })}
  </div>;
}
