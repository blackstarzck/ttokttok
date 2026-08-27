/** 소셜 카운트 축약: 1204 → "1.2천", 31400 → "3.1만" */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}천`;
  return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`;
}
