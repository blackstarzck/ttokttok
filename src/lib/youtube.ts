/**
 * 유튜브 URL에서 영상 ID를 뽑는다.
 * 관리자가 주소창에서 복사해 붙여넣는 온갖 형태를 받아 준다.
 */
export function parseYoutubeId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // 이미 ID만 넣은 경우 (11자, URL 안전 문자)
  if (/^[\w-]{11}$/.test(value)) return value;

  const patterns = [
    /[?&]v=([\w-]{11})/, // watch?v=ID
    /youtu\.be\/([\w-]{11})/, // youtu.be/ID
    /\/embed\/([\w-]{11})/, // /embed/ID
    /\/shorts\/([\w-]{11})/, // /shorts/ID
    /\/live\/([\w-]{11})/, // /live/ID
  ];

  for (const re of patterns) {
    const m = value.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * 시작 마스크용 썸네일.
 * hqdefault는 모든 영상에 있다 — maxresdefault는 없는 영상이 있어 깨진다.
 */
export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * 폴백 전용 임베드 주소 — IFrame API 스크립트가 막혔을 때만 쓴다.
 * 음소거 자동재생 + 루프. 루프는 playlist에 자기 ID를 넣어야 동작한다.
 *
 * 평소 경로에는 쓰지 않는다: playlist를 넣으면 유튜브가 재생목록으로 보고
 * 재생 컨트롤에 ⏮ ⏭ 를 그린다 (설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 */
export function youtubeEmbedUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: id,
    controls: "0",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
