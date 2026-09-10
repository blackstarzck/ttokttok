const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 목록용 날짜: "2026.08.28".
 * 표준시를 한국으로 고정한다 — 서버와 브라우저가 다른 날짜를 내면 안 된다.
 */
export function formatDate(iso: string): string {
  const parts = DATE_FMT.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

/** 소셜 카운트 축약: 1204 → "1.2천", 31400 → "3.1만" */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}천`;
  return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`;
}

/**
 * 서지 한 줄: "저자 · 역자 옮김 · 출판사" (없는 값은 생략).
 * post-item.tsx · book-sheet.tsx · cards/regions.tsx 세 곳이 각자 조립하던
 * 동일 로직을 한 곳으로 모은다.
 */
export function formatByline(book: {
  author: string;
  translator: string | null;
  publisher: string | null;
}): string {
  return [
    book.author,
    book.translator ? `${book.translator} 옮김` : null,
    book.publisher,
  ]
    .filter(Boolean)
    .join(" · ");
}



/** "3분 전", "2일 전" — 목록에서 절대 시각은 과하다. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}
