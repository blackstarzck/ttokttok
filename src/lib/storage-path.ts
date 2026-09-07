/**
 * 스토리지 공개 URL ↔ 오브젝트 경로 변환.
 *
 * 업로드 시점의 규약이 컬럼마다 다르다.
 *   `books.epub_path`        — 순수 경로 (`{id}.epub`). 비공개 버킷이라 URL이 없다.
 *   `books.cover_url`        — `getPublicUrl()`이 만든 **공개 URL**
 *   `post_videos.video_path` — 이름과 달리 역시 **공개 URL**
 *
 * 지울 때 스토리지 API가 받는 것은 경로뿐이라, URL을 담은 두 컬럼은
 * 되돌려야 한다.
 *
 * `post_videos.video_path`의 스키마 주석(20260827000001)은 "storage 'videos'
 * 버킷 경로"라고 적혀 있지만 실제 저장값은 공개 URL이다 — 주석이 코드보다
 * 오래됐다. 실측으로 확인했다.
 *
 * `server-only`를 붙이지 않는다: 문자열만 다루는 순수 함수라 서버 전용이
 * 아니고, 붙이면 node 환경인 vitest가 import하는 순간 던져 테스트할 수 없다.
 */

/** Supabase 공개 오브젝트 URL의 고정 구간. */
const PUBLIC_PREFIX = "/storage/v1/object/public/";

/**
 * 공개 URL에서 버킷 내 경로를 뽑는다. 그 버킷의 URL이 아니면 null.
 *
 * 버킷 이름을 인자로 받아 대조하는 이유: 다른 버킷의 URL을 잘못 넘겼을 때
 * 조용히 엉뚱한 경로를 돌려주는 대신 null이 되게 하려는 것이다. 삭제에
 * 쓰이는 값이라 조용한 오해가 남의 파일을 지울 수 있다.
 *
 * 퍼센트 디코딩은 하지 않는다 — 업로드가 넣은 문자열을 그대로 돌려줘야
 * 스토리지 API가 같은 오브젝트를 찾는다.
 */
export function pathFromPublicUrl(
  publicUrl: string | null | undefined,
  bucket: string,
): string | null {
  if (!publicUrl) return null;

  const marker = `${PUBLIC_PREFIX}${bucket}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return null;

  const path = publicUrl.slice(at + marker.length);
  return path || null;
}
