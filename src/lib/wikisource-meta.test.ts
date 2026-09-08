import { describe, expect, it } from "vitest";
import {
  isCandidate,
  parseCategories,
  parseHeader,
  toBookCategory,
} from "@/lib/wikisource-meta";

/**
 * 실측한 실제 위키텍스트 (「운수 좋은 날」, prop=revisions).
 * 단순화하지 않는다 — 값이 줄바꿈으로 끝난다는 사실이 파싱 규칙을 지배하고,
 * 그 사실을 지운 픽스처가 실제 오류 세 개를 하나도 잡지 못했다.
 */
const 운수좋은날 = `{{머리말
|제목 = 운수 좋은 날
|지은이 = [[저자:현진건|현진건]]
|역자 =
|부제 =
}}

새침하게 흐린 품이 눈이 올 듯하더니 눈은 아니 오고 얼다가 만 비가 내리었다.`;

/** 실측: 「가던 길 멈춰서」 — 표본 99개 중 유일한 번역물. */
const 번역물 = `{{머리말
|제목 = 가던 길 멈춰서
|저자 = [[윌리엄 데이비스]]
|역자 = [[사용자:pk0001|pk0001]]
|부제 =
}}`;

/** 실측: 항목 이름이 `저자`인 쪽 (표본 30개 중 23). 링크에 파이프가 없다. */
const 파이프없는링크 = `{{머리말
|제목 = 날개
|저자 = [[저자:이상]]
}}`;

/** 실측: 「강촌 (두보)」 — 머리말 틀을 쓰지 않는 한시 문서. */
const 머리말없음 = `{{한시
|제목 = 강촌
}}
淸江一曲抱村流`;

describe("parseHeader", () => {
  it("지은이 항목에서 저자를 뽑는다", () => {
    expect(parseHeader(운수좋은날)).toEqual({
      title: "운수 좋은 날",
      author: "현진건",
      translator: null,
    });
  });

  it("저자 항목 이름도 인식한다 — 위키문헌이 둘을 섞어 쓴다", () => {
    expect(parseHeader(파이프없는링크).author).toBe("이상");
  });

  /**
   * 표시명과 대상명이 **다른** 픽스처여야 이 테스트가 뜻을 갖는다.
   * 「운수 좋은 날」은 `[[저자:현진건|현진건]]`로 둘이 같아서, 어느 쪽을
   * 집어도 통과한다 — 그 픽스처로는 아무것도 확인하지 못한다.
   */
  it("링크에 파이프가 있으면 표시명을 쓴다", () => {
    expect(parseHeader(`{{머리말\n|저자 = [[저자:김정식|김소월]]\n}}`).author).toBe(
      "김소월",
    );
  });

  /**
   * 실제로 틀렸던 경우 ①: `[^|}\n]*`로 값을 끊으면 링크 **안의 파이프**에서
   * 잘려 `[[저자:현진건`이 된다.
   */
  it("링크 안의 파이프에서 값을 끊지 않는다", () => {
    expect(parseHeader(운수좋은날).author).not.toContain("[[");
    expect(parseHeader(운수좋은날).author).not.toContain("저자:");
  });

  /**
   * 실제로 틀렸던 경우 ②: `\s*`가 줄바꿈까지 먹어, 빈 `|역자 =`가 다음 줄
   * `|부제 = `를 값으로 끌어왔다. 99개 중 60개가 번역물로 오판됐다.
   */
  it("빈 역자 항목이 다음 줄을 값으로 끌어오지 않는다", () => {
    expect(parseHeader(운수좋은날).translator).toBeNull();
  });

  it("역자가 채워져 있으면 뽑는다 — 번역물 판정의 근거다", () => {
    expect(parseHeader(번역물).translator).toBe("pk0001");
    expect(parseHeader(번역물).author).toBe("윌리엄 데이비스");
  });

  it("머리말 틀이 없으면 전부 null", () => {
    expect(parseHeader(머리말없음)).toEqual({
      title: null,
      author: null,
      translator: null,
    });
  });

  it("빈 문자열을 견딘다", () => {
    expect(parseHeader("")).toEqual({ title: null, author: null, translator: null });
  });
});

/**
 * 실측한 분류 목록 (prop=categories). API는 `분류:` 접두사를 붙여 주므로
 * 픽스처도 붙인다 — 접두사를 지운 픽스처는 실제 입력이 아니다.
 */
const CATS = {
  운수좋은날: ["분류:1924년 작품", "분류:PD-old-50", "분류:단편소설"],
  님의침묵: ["분류:1926년 작품", "분류:PD-old-70", "분류:시집"],
  태평천하: ["분류:1938년 작품", "분류:PD-old-50", "분류:장편소설"],
  홍염: ["분류:1927년 작품", "분류:PD-old-70", "분류:연도 미입력 작품"],
  상록수: ["분류:1935년 작품", "분류:1936년 작품", "분류:PD-old-50", "분류:장편소설"],
  좌평성충: ["분류:PD-old-70", "분류:단편소설", "분류:하위 문서"],
  일장기의물결: ["분류:1942년 작품", "분류:PD-old-50", "분류:단편소설", "분류:친일문학"],
  고향_역: ["분류:1926년 작품", "분류:단편소설"],
  겹장르: ["분류:1925년 작품", "분류:PD-old-50", "분류:단편소설", "분류:한국의 소설"],
} as const;

describe("parseCategories", () => {
  it("장르·연도·PD 태그를 뽑는다", () => {
    expect(parseCategories(CATS.운수좋은날)).toEqual({
      genre: "단편소설",
      pubYear: 1924,
      pdTag: "PD-old-50",
      isSubpage: false,
      isCollaborationist: false,
    });
  });

  it("시집도 장르다", () => {
    expect(parseCategories(CATS.님의침묵).genre).toBe("시집");
  });

  it("연도가 둘이면 가장 이른 것을 쓴다", () => {
    expect(parseCategories(CATS.상록수).pubYear).toBe(1935);
  });

  /** 실측 17건. 표의 한 칸에는 하나만 적어야 하므로 우선순위로 고른다. */
  it("장르가 여러 개면 구체적인 것을 고른다", () => {
    expect(parseCategories(CATS.겹장르).genre).toBe("단편소설");
  });

  it("범위 밖 장르만 있으면 genre는 null", () => {
    expect(parseCategories(CATS.홍염).genre).toBeNull();
  });

  it("연도 분류가 없으면 pubYear는 null", () => {
    expect(parseCategories(["분류:PD-old-50", "분류:단편소설"]).pubYear).toBeNull();
  });

  it("PD 태그가 없으면 pdTag는 null", () => {
    expect(parseCategories(CATS.고향_역).pdTag).toBeNull();
  });

  it("하위 문서와 친일문학을 표시한다", () => {
    expect(parseCategories(CATS.좌평성충).isSubpage).toBe(true);
    expect(parseCategories(CATS.일장기의물결).isCollaborationist).toBe(true);
  });

  it("`분류:` 접두사가 없는 값도 견딘다", () => {
    expect(parseCategories(["단편소설", "PD-old-50"]).genre).toBe("단편소설");
  });

  it("빈 배열을 견딘다", () => {
    expect(parseCategories([])).toEqual({
      genre: null,
      pubYear: null,
      pdTag: null,
      isSubpage: false,
      isCollaborationist: false,
    });
  });

  /**
   * `연도 미입력 작품`은 데이터 품질 표시일 뿐 연도가 아니다.
   *
   * 「홍염」(`1927년 작품` + `연도 미입력 작품`)으로 확인하면 뜻이 없다 —
   * 옆에 진짜 연도가 있어서 1927이 나오는 것이 이 분류를 무시한 증거가
   * 되지 못한다. 이 분류만 있는 경우로 확인해야 한다.
   */
  it("연도 미입력 작품을 연도로 읽지 않는다", () => {
    expect(
      parseCategories(["분류:PD-old-50", "분류:단편소설", "분류:연도 미입력 작품"])
        .pubYear,
    ).toBeNull();
  });
});

describe("isCandidate", () => {
  it("장르·PD 태그가 있고 제외 표시가 없으면 후보다", () => {
    expect(isCandidate(parseCategories(CATS.운수좋은날))).toEqual({ ok: true });
  });

  it("범위 밖 장르는 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.홍염))).toEqual({
      ok: false,
      reason: "범위 밖 장르",
    });
  });

  /**
   * 장으로 쪼개진 문서를 목록에 두면 그것을 골라도 1장만 들어온다 —
   * 목록이 잘못된 선택을 유도한다. 실측 8건.
   */
  it("하위 문서를 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.좌평성충))).toEqual({
      ok: false,
      reason: "하위 문서",
    });
  });

  it("친일문학을 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.일장기의물결))).toEqual({
      ok: false,
      reason: "친일문학",
    });
  });

  it("PD 태그가 없으면 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.고향_역))).toEqual({
      ok: false,
      reason: "PD 태그 없음",
    });
  });

  /**
   * 제외 사유의 우선순위를 못박는다. 설계 문서의 실측치(하위 문서 8 ·
   * 친일문학 2 · PD 태그 없음 26)가 이 순서로 센 값이라, 순서가 바뀌면
   * 동기화 보고와 설계 문서의 숫자가 어긋난다.
   */
  it("사유가 겹치면 장르 → 하위 문서 → 친일문학 → PD 순으로 보고한다", () => {
    expect(
      isCandidate({
        genre: "단편소설",
        pubYear: null,
        pdTag: null,
        isSubpage: true,
        isCollaborationist: true,
      }),
    ).toEqual({ ok: false, reason: "하위 문서" });
  });
});

describe("toBookCategory", () => {
  /**
   * 위키문헌은 `단편소설`이라 부르고 `books.category`는 `소설`을 쓴다
   * (실측: 기존 16권이 `소설` 12 · `시` 4). 범위를 좁힌 결과 새 값이
   * 생기지 않는다 — 기존 둘로 전부 덮인다.
   */
  it("소설 계열은 전부 소설", () => {
    for (const g of ["장편소설", "중편소설", "단편소설", "역사소설", "신소설", "추리소설", "한국의 소설", "소설"] as const) {
      expect(toBookCategory(g)).toBe("소설");
    }
  });

  it("시집은 시", () => {
    expect(toBookCategory("시집")).toBe("시");
  });
});
