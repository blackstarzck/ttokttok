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
