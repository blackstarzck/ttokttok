import { describe, expect, it } from "vitest";
import {
  applyCatalogueQuery,
  buildCatalogueHref,
  decadeOptions,
  nextSortDir,
  parseCatalogueQuery,
  type CatalogueQuery,
  type WorkRow,
} from "@/lib/wikisource-catalogue";

describe("parseCatalogueQuery", () => {
  it("아무 파라미터도 없으면 기본값 — 제목 오름차, 1쪽", () => {
    expect(parseCatalogueQuery({})).toEqual({
      q: "",
      genre: null,
      decade: null,
      noYear: false,
      sort: "title",
      dir: "asc",
      page: 1,
      hideRegistered: false,
      showUnlistable: false,
    });
  });

  it("검색어의 앞뒤 공백을 떼낸다", () => {
    expect(parseCatalogueQuery({ q: "  운수  " }).q).toBe("운수");
  });

  /**
   * 정렬 키를 화이트리스트로 거르는 것이 이 함수의 핵심이다. 파라미터를
   * 그대로 정렬에 쓰면 없는 컬럼 이름이 들어와 예외가 되고, 뒷날 SQL로
   * 옮길 때는 그대로 주입면이 된다.
   */
  it("모르는 정렬 키는 제목으로 되돌린다", () => {
    expect(parseCatalogueQuery({ sort: "pd_tag" }).sort).toBe("title");
    expect(parseCatalogueQuery({ sort: "; drop table" }).sort).toBe("title");
  });

  it("아는 정렬 키는 그대로 쓴다", () => {
    expect(parseCatalogueQuery({ sort: "author" }).sort).toBe("author");
    expect(parseCatalogueQuery({ sort: "year" }).sort).toBe("year");
    expect(parseCatalogueQuery({ sort: "genre" }).sort).toBe("genre");
  });

  it("모르는 정렬 방향은 오름차로 되돌린다", () => {
    expect(parseCatalogueQuery({ dir: "sideways" }).dir).toBe("asc");
    expect(parseCatalogueQuery({ dir: "desc" }).dir).toBe("desc");
  });

  it("모르는 장르는 필터 없음으로 되돌린다", () => {
    expect(parseCatalogueQuery({ genre: "수필" }).genre).toBeNull();
    expect(parseCatalogueQuery({ genre: "시집" }).genre).toBe("시집");
  });

  it("쪽 번호가 숫자가 아니거나 1보다 작으면 1쪽", () => {
    expect(parseCatalogueQuery({ page: "0" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "-3" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "abc" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "3" }).page).toBe(3);
  });

  it("연대는 10년 단위 숫자만 받는다", () => {
    expect(parseCatalogueQuery({ decade: "1920" })).toMatchObject({
      decade: 1920,
      noYear: false,
    });
    expect(parseCatalogueQuery({ decade: "1925" }).decade).toBeNull();
    expect(parseCatalogueQuery({ decade: "없음" }).decade).toBeNull();
  });

  it("연대 `none`은 연도 없는 것만 보는 뜻이다", () => {
    expect(parseCatalogueQuery({ decade: "none" })).toMatchObject({
      decade: null,
      noYear: true,
    });
  });

  it("체크박스는 `1`일 때만 켜진다", () => {
    expect(parseCatalogueQuery({ hide: "1" }).hideRegistered).toBe(true);
    expect(parseCatalogueQuery({ hide: "0" }).hideRegistered).toBe(false);
    expect(parseCatalogueQuery({ all: "1" }).showUnlistable).toBe(true);
  });

  /** searchParams는 같은 키가 두 번 오면 배열이 된다. */
  it("배열로 온 값은 무시한다", () => {
    expect(parseCatalogueQuery({ q: ["a", "b"] }).q).toBe("");
    expect(parseCatalogueQuery({ sort: ["author", "title"] }).sort).toBe("title");
  });
});

/** 실측 데이터의 모양을 따른 표본. 금지 저작자와 번역물을 일부러 섞었다. */
const ROWS: WorkRow[] = [
  { page_title: "운수 좋은 날", title: "운수 좋은 날", author: "현진건", genre: "단편소설", pub_year: 1924, translator: null },
  { page_title: "날개", title: "날개", author: "이상", genre: "단편소설", pub_year: 1936, translator: null },
  { page_title: "태평천하", title: "태평천하", author: "채만식", genre: "장편소설", pub_year: 1938, translator: null },
  { page_title: "진달래꽃 (시집)", title: "진달래꽃", author: "김소월", genre: "시집", pub_year: 1925, translator: null },
  { page_title: "강촌 (두보)", title: "강촌", author: null, genre: "단편소설", pub_year: null, translator: null },
  { page_title: "토지", title: "토지", author: "박경리", genre: "장편소설", pub_year: 1969, translator: null },
  { page_title: "가던 길 멈춰서", title: "가던 길 멈춰서", author: "윌리엄 데이비스", genre: "시집", pub_year: 1911, translator: "pk0001" },
];

/** page_title → books.id. 실제로는 books.source_ref로 짝지어 만든다. */
const REGISTERED = new Map([["운수 좋은 날", "book-1"]]);

const run = (patch: Partial<CatalogueQuery> = {}, rows: WorkRow[] = ROWS) =>
  applyCatalogueQuery(rows, { ...parseCatalogueQuery({}), ...patch }, REGISTERED);

describe("applyCatalogueQuery", () => {
  it("기본은 등록 불가를 가린다 — 금지 저작자와 번역물", () => {
    const titles = run().rows.map((r) => r.title);
    expect(titles).not.toContain("토지");
    expect(titles).not.toContain("가던 길 멈춰서");
    expect(run().total).toBe(5);
  });

  it("저자가 비어 있는 행은 가리지 않는다 — 가져올 때 입력받는다", () => {
    expect(run().rows.map((r) => r.title)).toContain("강촌");
  });

  it("등록 불가 포함해서 보기를 켜면 사유와 함께 나온다", () => {
    const rows = run({ showUnlistable: true }).rows;
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.title === "토지")?.blockedReason).toMatch(/2008년/);
    expect(rows.find((r) => r.title === "가던 길 멈춰서")?.blockedReason).toMatch(/번역/);
    expect(rows.find((r) => r.title === "날개")?.blockedReason).toBeNull();
  });

  it("등록된 작품에 books.id를 붙인다", () => {
    expect(run().rows.find((r) => r.page_title === "운수 좋은 날")?.bookId).toBe("book-1");
    expect(run().rows.find((r) => r.title === "날개")?.bookId).toBeNull();
  });

  it("등록된 것 숨기기", () => {
    expect(run({ hideRegistered: true }).rows.map((r) => r.title)).not.toContain(
      "운수 좋은 날",
    );
    expect(run({ hideRegistered: true }).total).toBe(4);
  });

  it("검색은 작품명과 저자를 모두 본다", () => {
    expect(run({ q: "날개" }).rows.map((r) => r.title)).toEqual(["날개"]);
    expect(run({ q: "현진건" }).rows.map((r) => r.title)).toEqual(["운수 좋은 날"]);
  });

  it("검색은 부분 일치이고 대소문자를 가리지 않는다", () => {
    expect(run({ q: "좋은" }).total).toBe(1);
    expect(run({ q: "WILLIAM" }).total).toBe(0);
  });

  /** 저자가 null인 행에서 검색이 터지면 목록 전체가 죽는다. */
  it("저자가 null인 행에서 검색이 터지지 않는다", () => {
    expect(() => run({ q: "아무거나" })).not.toThrow();
    expect(run({ q: "강촌" }).total).toBe(1);
  });

  it("장르 필터", () => {
    expect(run({ genre: "시집" }).rows.map((r) => r.title)).toEqual(["진달래꽃"]);
    expect(run({ genre: "단편소설" }).total).toBe(3);
  });

  it("연대 필터는 10년 구간이다", () => {
    expect(run({ decade: 1920 }).rows.map((r) => r.title)).toEqual([
      "운수 좋은 날",
      "진달래꽃",
    ]);
    expect(run({ decade: 1930 }).rows.map((r) => r.title)).toEqual([
      "날개",
      "태평천하",
    ]);
  });

  it("연도 없음 필터", () => {
    expect(run({ noYear: true }).rows.map((r) => r.title)).toEqual(["강촌"]);
  });

  it("제목을 한국어 순서로 정렬한다", () => {
    expect(run().rows.map((r) => r.title)).toEqual([
      "강촌",
      "날개",
      "운수 좋은 날",
      "진달래꽃",
      "태평천하",
    ]);
  });

  it("내림차 정렬", () => {
    expect(run({ dir: "desc" }).rows.map((r) => r.title)).toEqual([
      "태평천하",
      "진달래꽃",
      "운수 좋은 날",
      "날개",
      "강촌",
    ]);
  });

  it("연도 정렬", () => {
    expect(run({ sort: "year" }).rows.map((r) => r.pub_year)).toEqual([
      1924, 1925, 1936, 1938, null,
    ]);
  });

  /**
   * 빈 값은 방향과 무관하게 끝으로 보낸다. 내림차로 정렬했더니 `—`가 위에
   * 몰리면 표가 쓸모없어진다.
   */
  it("빈 값은 오름차·내림차 모두 끝으로 보낸다", () => {
    expect(run({ sort: "year", dir: "desc" }).rows.map((r) => r.pub_year)).toEqual([
      1938, 1936, 1925, 1924, null,
    ]);
    expect(run({ sort: "author", dir: "desc" }).rows.at(-1)?.author).toBeNull();
  });

  it("쪽을 자른다", () => {
    const many: WorkRow[] = Array.from({ length: 120 }, (_, i) => ({
      page_title: `문서 ${i}`,
      title: `제목 ${String(i).padStart(3, "0")}`,
      author: "현진건",
      genre: "단편소설" as const,
      pub_year: 1930,
      translator: null,
    }));

    const first = applyCatalogueQuery(many, parseCatalogueQuery({}), REGISTERED);
    expect(first.rows).toHaveLength(50);
    expect(first.total).toBe(120);
    expect(first.pageCount).toBe(3);
    expect(first.rows[0].title).toBe("제목 000");

    const last = applyCatalogueQuery(many, parseCatalogueQuery({ page: "3" }), REGISTERED);
    expect(last.rows).toHaveLength(20);
    expect(last.page).toBe(3);
  });

  /**
   * 7쪽을 보다가 필터를 걸면 결과가 1쪽으로 줄 수 있다. 그때 빈 표를
   * 보여주면 관리자는 "필터에 걸리는 게 없다"로 읽는다 — 실제로는 있다.
   */
  it("쪽 번호가 범위를 넘으면 마지막 쪽으로 당긴다", () => {
    const r = run({ page: 9 });
    expect(r.page).toBe(1);
    expect(r.rows).toHaveLength(5);
  });

  it("결과가 없으면 pageCount는 1이고 rows는 빈 배열", () => {
    const r = run({ q: "없는작품" });
    expect(r.total).toBe(0);
    expect(r.pageCount).toBe(1);
    expect(r.page).toBe(1);
    expect(r.rows).toEqual([]);
  });
});

describe("decadeOptions", () => {
  /** 선택지를 손으로 적으면 데이터와 어긋난다 — 실제 값에서 만든다. */
  it("실제 데이터에 있는 연대만 오름차로 준다", () => {
    expect(decadeOptions(ROWS)).toEqual({
      decades: [1910, 1920, 1930, 1960],
      hasNoYear: true,
    });
  });

  it("연도 없는 행이 없으면 hasNoYear는 false", () => {
    expect(decadeOptions(ROWS.filter((r) => r.pub_year !== null)).hasNoYear).toBe(false);
  });

  it("빈 배열을 견딘다", () => {
    expect(decadeOptions([])).toEqual({ decades: [], hasNoYear: false });
  });
});

describe("nextSortDir", () => {
  it("같은 컬럼을 다시 누르면 방향이 뒤집힌다", () => {
    expect(nextSortDir(parseCatalogueQuery({ sort: "title", dir: "asc" }), "title")).toBe(
      "desc",
    );
  });

  it("다른 컬럼을 누르면 오름차로 시작한다", () => {
    expect(nextSortDir(parseCatalogueQuery({ sort: "title", dir: "desc" }), "author")).toBe(
      "asc",
    );
  });
});

describe("buildCatalogueHref", () => {
  const base = parseCatalogueQuery({});

  it("기본값인 항목은 주소에 넣지 않는다 — 주소가 읽을 수 있게 남는다", () => {
    expect(buildCatalogueHref(base, {})).toBe("/admin/books/wikisource");
  });

  it("바꾼 항목만 담는다", () => {
    const href = buildCatalogueHref(base, { genre: "시집" });
    expect(new URL(href, "http://x").searchParams.get("genre")).toBe("시집");
  });

  /**
   * 7쪽을 보다가 장르를 고르면 결과가 1쪽뿐일 수 있다. 쪽 번호를 물고 가면
   * 빈 표가 뜬다.
   */
  it("필터를 바꾸면 쪽 번호를 1로 되돌린다", () => {
    const onPage7 = parseCatalogueQuery({ page: "7" });
    expect(buildCatalogueHref(onPage7, { genre: "시집" })).not.toContain("page=");
    expect(buildCatalogueHref(onPage7, { q: "날개" })).not.toContain("page=");
    expect(buildCatalogueHref(onPage7, { sort: "author" })).not.toContain("page=");
  });

  it("쪽 번호만 바꿀 때는 나머지 상태를 물고 간다", () => {
    const href = buildCatalogueHref(parseCatalogueQuery({ genre: "시집" }), { page: 3 });
    expect(href).toContain("page=3");
    expect(new URL(href, "http://x").searchParams.get("genre")).toBe("시집");
  });

  it("연도 없음은 decade=none으로 담는다", () => {
    expect(buildCatalogueHref(base, { noYear: true })).toContain("decade=none");
  });

  it("체크박스는 켤 때만 담는다", () => {
    expect(buildCatalogueHref(base, { hideRegistered: true })).toContain("hide=1");
    expect(buildCatalogueHref(base, { hideRegistered: false })).not.toContain("hide=");
  });
});
