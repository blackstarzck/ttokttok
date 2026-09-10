/**
 * 링크형 도서의 외부 서점 구매 링크 (PRD §5.12).
 *
 * ISBN으로 각 서점 검색 URL을 자동 생성하고, 관리자가 도서별로 넣어 둔
 * `purchase_links`가 있으면 그쪽이 이긴다.
 */

export type StoreKey = "kyobo" | "yes24" | "aladin";

const STORES: { key: StoreKey; label: string; search: (isbn: string) => string }[] =
  [
    {
      key: "kyobo",
      label: "교보문고",
      search: (isbn) =>
        `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(isbn)}`,
    },
    {
      key: "yes24",
      label: "예스24",
      search: (isbn) =>
        `https://www.yes24.com/product/search?query=${encodeURIComponent(isbn)}`,
    },
    {
      key: "aladin",
      label: "알라딘",
      search: (isbn) =>
        `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord=${encodeURIComponent(isbn)}`,
    },
  ];

export type PurchaseLink = { key: StoreKey; label: string; url: string };

/**
 * 서점별 링크 목록. 수동 URL이 우선이고, 없으면 ISBN으로 생성한다.
 * 둘 다 없는 서점은 빠진다 — 링크 없는 버튼을 그리지 않기 위함.
 */
export function buildPurchaseLinks(book: {
  isbn: string | null;
  purchase_links: Record<string, string> | null;
}): PurchaseLink[] {
  const manual = book.purchase_links ?? {};

  return STORES.flatMap(({ key, label, search }) => {
    const url = manual[key] || (book.isbn ? search(book.isbn) : null);
    return url ? [{ key, label, url }] : [];
  });
}
