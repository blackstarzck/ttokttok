import { describe, expect, it } from "vitest";
import {
  type AuthorInfo,
  authorPageTitle,
  checkAuthor,
  eraConsistent,
  EXCLUSION_REASONS,
  isCandidate,
  parseAuthorPage,
  parseCategories,
  parseHeader,
  stripAuthorAnnotation,
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

/** 실측: 「동백꽃」 — 영어 이름 틀. 329편 중 13편이 이 모양이고, 우리 파서가 못 읽었다. */
const 영어틀 = `{{머리말
 | title    =동백꽃
 | author   =[[글쓴이:김유정|김유정]]
 | section  =
 | previous =
 | next     =
 | notes    =
}}

오늘도 또 우리 수탉이 막 쫓기었다.`;

/** 실측: 「구운몽」 — `글쓴이` 항목. 329편 중 1편. */
const 글쓴이틀 = `{{머리말
|제목 = 구운몽
|글쓴이 = [[글쓴이:김만중|김만중]]
|설명 = 김만중이 남해 유배 시절 지었다고 전해지는 작품이다.
}}`;

/** 실측: 「소년의 비애」 — 영어 이름 + `저자:` 이름공간 + 항목마다 들쭉날쭉한 공백. */
const 영어틀_저자링크 = `{{머리말
 | title    = 소년의 비애
| author   = [[저자:이광수|이광수]]
 | section  =
 | notes    = 1917년 잡지 《청춘》에 실린 데뷔작.
}}`;

describe("parseHeader — 실측한 항목 이름 전부", () => {
  it("영어 이름 틀의 author를 읽는다 (13편)", () => {
    expect(parseHeader(영어틀)).toEqual({
      title: "동백꽃",
      author: "김유정",
      translator: null,
    });
  });

  it("글쓴이 항목을 읽는다 (1편)", () => {
    expect(parseHeader(글쓴이틀).author).toBe("김만중");
  });

  it("영어 이름 틀에서도 저자: 이름공간을 처리한다", () => {
    expect(parseHeader(영어틀_저자링크)).toEqual({
      title: "소년의 비애",
      author: "이광수",
      translator: null,
    });
  });

  /**
   * 링크에 표시명이 없으면 이름공간 접두사가 값에 남는다. `저자:`만 떼던
   * 정규식으로는 `글쓴이:김만중`이 저자 이름이 된다. 실측 링크 이름공간은
   * `저자:`(308)와 `글쓴이:`(28) 둘이다.
   */
  it("표시명이 없는 링크에서 두 이름공간을 모두 떼낸다", () => {
    expect(parseHeader(`{{머리말\n|저자 = [[글쓴이:김만중]]\n}}`).author).toBe("김만중");
    expect(parseHeader(`{{머리말\n|저자 = [[저자:이상]]\n}}`).author).toBe("이상");
  });

  /**
   * 영어 이름 틀에는 역자 항목이 아예 없다(실측). 그러니 그 13편은 머리말로
   * 번역물 여부를 판정할 수 없고 — null이 「번역물 아님」의 증거가 될 수 없다 —
   * 이것이 저자 쪽 검사를 반드시 거쳐야 하는 이유다.
   */
  it("영어 이름 틀은 역자를 알 수 없어 null이다", () => {
    expect(parseHeader(영어틀).translator).toBeNull();
  });
});

describe("parseCategories — PD 태그를 문서대로 좁힌다", () => {
  /**
   * 처음 정규식은 `/^PD-/`였고 문서·주석·PRD §11-64는 모두 `PD-old-*`라고
   * 적어 놓았다. 실측으로 두 건이 그 틈으로 들어왔다:
   * 「파초」는 `PD-공유마당`(나이 만료가 아니라 이용 허락 기반),
   * 「자유종」은 `PD-old-95-US`(미국 기준이라 한국법에 대해 말하는 바가 없다).
   */
  it("PD-old 계열만 받는다", () => {
    expect(parseCategories(["분류:PD-old-50"]).pdTag).toBe("PD-old-50");
    expect(parseCategories(["분류:PD-old-100"]).pdTag).toBe("PD-old-100");
    expect(parseCategories(["분류:PD-old"]).pdTag).toBe("PD-old");
  });

  it("공유마당·미국 기준·자체 배포 태그는 받지 않는다", () => {
    expect(parseCategories(["분류:PD-공유마당", "분류:단편소설"]).pdTag).toBeNull();
    expect(parseCategories(["분류:PD-old-95-US", "분류:신소설"]).pdTag).toBeNull();
    expect(parseCategories(["분류:PD-self", "분류:소설"]).pdTag).toBeNull();
  });
});

describe("stripAuthorAnnotation", () => {
  /**
   * `authorPageTitle`(이 파일)과 `blockedAuthorReason`(`book-rights.ts`)이
   * 이 함수 하나를 공유한다(Finding 4, 브랜치 전체 검토). 두 벌로 나뉘어
   * 있을 때는 한쪽만 새 괄호 형태를 받도록 넓히면 다른 쪽이 놓쳤다 — 그
   * 반대 방향의 대조 테스트는 `book-rights.test.ts`에 있다.
   */
  it("괄호와 그 뒤를 뗀다", () => {
    expect(stripAuthorAnnotation("김소월(김정식)")).toBe("김소월");
    expect(stripAuthorAnnotation("이정호(李定鎬)")).toBe("이정호");
  });

  it("전각 괄호도 뗀다", () => {
    expect(stripAuthorAnnotation("백석（白石）")).toBe("백석");
  });

  it("괄호가 없으면 그대로 돌려준다", () => {
    expect(stripAuthorAnnotation("현진건")).toBe("현진건");
  });
});

describe("authorPageTitle", () => {
  it("저자 문서 제목을 만든다", () => {
    expect(authorPageTitle("김유정")).toBe("저자:김유정");
  });

  /** 실측: 「김소월(김정식)」·「이정호(李定鎬)」처럼 괄호가 붙은 이름이 있다. */
  it("괄호와 그 뒤를 떼낸다", () => {
    expect(authorPageTitle("김소월(김정식)")).toBe("저자:김소월");
    expect(authorPageTitle("이정호(李定鎬)")).toBe("저자:이정호");
    expect(authorPageTitle("요시카와 에이지(吉川英治)")).toBe("저자:요시카와 에이지");
  });
});

describe("parseAuthorPage", () => {
  /** 실측한 실제 분류. `년년`은 위키문헌 틀의 오타이고 분류 이름이 그렇다. */
  const 김동인 = ["분류:1900년년 태어남", "분류:1951년년 죽음", "분류:대한민국의 저자", "분류:일제 강점기의 저자"];
  const 톨스토이 = ["분류:1828년년 태어남", "분류:1910년년 죽음", "분류:러시아의 저자"];
  const 김억 = ["분류:1896년년 태어남", "분류:일제 강점기의 저자", "분류:조선민주주의인민공화국의 저자"];

  it("사망·출생 연도를 읽는다 — 분류 이름의 `년년`을 그대로 받는다", () => {
    expect(parseAuthorPage(김동인, false)).toMatchObject({ born: 1900, died: 1951 });
  });

  it("국적을 판정한다", () => {
    expect(parseAuthorPage(김동인, false).isKorean).toBe(true);
    expect(parseAuthorPage(톨스토이, false).isKorean).toBe(false);
  });

  it("북한 저자 분류를 표시한다", () => {
    expect(parseAuthorPage(김억, false).isNorthKorean).toBe(true);
    expect(parseAuthorPage(김동인, false).isNorthKorean).toBe(false);
  });

  it("사망 연도가 없으면 null", () => {
    expect(parseAuthorPage(김억, false).died).toBeNull();
  });

  it("문서가 없으면 missing", () => {
    expect(parseAuthorPage([], true).missing).toBe(true);
  });

  /** 「일제 강점기의 저자」만 있어도 한국 저자다 — 실측에서 가장 흔한 형태다. */
  it("일제 강점기 분류만 있어도 한국 저자로 본다", () => {
    expect(parseAuthorPage(["분류:일제 강점기의 저자"], false).isKorean).toBe(true);
  });

  it("`분류:` 접두사가 없는 값도 견딘다", () => {
    expect(parseAuthorPage(["1951년년 죽음", "대한민국의 저자"], false)).toMatchObject({
      died: 1951,
      isKorean: true,
    });
  });

  /**
   * 선사·삼국시대 한국 저자를 인식한다 — 실측에서 최치원(신라)과
   * 일연(고려)이 이 분류로 나타났다. 조선도 유지해 기존 테스트를
   * 커버한다. 외국 저자(러시아)는 여전히 한국 저자로 인식되지 않는다.
   */
  it("신라 저자를 인식한다", () => {
    expect(parseAuthorPage(["분류:신라의 저자"], false).isKorean).toBe(true);
  });

  it("고려 저자를 인식한다", () => {
    expect(parseAuthorPage(["분류:고려의 저자"], false).isKorean).toBe(true);
  });

  it("조선 저자를 계속 인식한다", () => {
    expect(parseAuthorPage(["분류:조선의 저자"], false).isKorean).toBe(true);
  });

  it("외국 저자는 인식하지 않는다", () => {
    expect(parseAuthorPage(["분류:러시아의 저자"], false).isKorean).toBe(false);
  });
});

describe("checkAuthor", () => {
  const info = (o: Partial<AuthorInfo> = {}): AuthorInfo => ({
    born: null, died: 1950, isKorean: true, isNorthKorean: false, missing: false, ...o,
  });

  it("한국 저자이고 1962년 이전 사망이면 통과", () => {
    expect(checkAuthor(info({ died: 1951 }))).toEqual({ ok: true });
  });

  it("해외 저자를 제외한다 — 번역자 저작권이 별개다 (PRD §5.11)", () => {
    expect(checkAuthor(info({ isKorean: false }))).toEqual({ ok: false, reason: "해외 저자" });
  });

  /** PRD §5.11의 기준을 그대로 구현한다 — 위키문헌의 PD 태그가 아니라. */
  it("1962년 이후 사망을 제외한다", () => {
    expect(checkAuthor(info({ died: 1968 }))).toEqual({ ok: false, reason: "1962년 이후 사망" });
    expect(checkAuthor(info({ died: 1962 }))).toEqual({ ok: false, reason: "1962년 이후 사망" });
    expect(checkAuthor(info({ died: 1961 }))).toEqual({ ok: true });
  });

  it("사망 연도를 모르면 제외한다 — 기준을 적용할 수 없다", () => {
    expect(checkAuthor(info({ died: null }))).toEqual({ ok: false, reason: "사망 연도 불명" });
  });

  it("북한 저자를 제외한다 — 사망 연도가 있어도", () => {
    expect(checkAuthor(info({ died: 1960, isNorthKorean: true }))).toEqual({
      ok: false, reason: "북한 저자",
    });
  });

  it("저자 문서가 없으면 제외한다", () => {
    expect(checkAuthor(info({ missing: true }))).toEqual({ ok: false, reason: "저자 문서 없음" });
  });

  /**
   * 사유 우선순위를 못박는다. 동기화 보고의 사유별 집계가 이 순서로
   * 세어지므로 바뀌면 문서의 숫자와 어긋난다. 각 단정은 **한 가지 사유만**
   * 참인 경우와 구별되어야 뜻이 있으므로, 겹치는 조합으로 확인한다.
   */
  it("사유가 겹치면 문서없음 → 해외 → 북한 → 사망연도 순으로 보고한다", () => {
    expect(checkAuthor(info({ missing: true, isKorean: false, isNorthKorean: true, died: null })))
      .toEqual({ ok: false, reason: "저자 문서 없음" });
    expect(checkAuthor(info({ isKorean: false, isNorthKorean: true, died: null })))
      .toEqual({ ok: false, reason: "해외 저자" });
    expect(checkAuthor(info({ isNorthKorean: true, died: null })))
      .toEqual({ ok: false, reason: "북한 저자" });
    expect(checkAuthor(info({ died: null })))
      .toEqual({ ok: false, reason: "사망 연도 불명" });
  });
});

describe("eraConsistent", () => {
  const info = (born: number | null, died: number | null): AuthorInfo => ({
    born,
    died,
    isKorean: true,
    isNorthKorean: false,
    missing: false,
  });

  it("생존 중 발표는 통과한다", () => {
    expect(eraConsistent(1935, info(1900, 1951))).toBe(true);
  });

  /**
   * 실측: 윤동주(1945년 사망)의 작품은 사후 1948년·1979년에도 발표됐다.
   * 34년 뒤인 1979년까지 통과해야 이 창이 "생존 중만 허용"으로 좁지
   * 않다는 것이 확인된다 — 관용 없는(사후 발표는 전부 배제) 틀린 규칙과
   * 여기서 갈린다.
   */
  it("사후 발표라도 50년 이내면 통과한다 — 윤동주 사례", () => {
    expect(eraConsistent(1979, info(null, 1945))).toBe(true);
  });

  /**
   * 경계값을 못박는다. 정확히 50년 뒤(1995)는 통과, 51년째(1996)부터는
   * 배제해야 "50년"이라는 구체적 수치가 지켜진다 — 창을 더 좁거나 넓게
   * 잡은 틀린 구현과 이 지점에서 갈린다.
   */
  it("사망 50년 뒤까지는 통과, 51년째부터 배제한다", () => {
    expect(eraConsistent(1995, info(null, 1945))).toBe(true);
    expect(eraConsistent(1996, info(null, 1945))).toBe(false);
  });

  it("출생 이전 발표는 배제한다", () => {
    expect(eraConsistent(1899, info(1900, null))).toBe(false);
  });

  /** 사망 50년을 크게 넘긴 발표 — 아예 다른 시대의 저자를 짚었다는 신호다. */
  it("사망 50년을 크게 넘긴 발표는 배제한다", () => {
    expect(eraConsistent(1954, info(null, 1650))).toBe(false);
  });

  /**
   * 발표 연도를 모르면 판단할 근거가 없다. 저자 생몰년을 아주 좁게
   * (1990~2000) 두어도 통과해야, "모른다"를 "배제"로 잘못 바꾸지 않았다는
   * 것이 확인된다.
   */
  it("발표 연도를 모르면 통과시킨다", () => {
    expect(eraConsistent(null, info(1990, 2000))).toBe(true);
  });

  /**
   * 저자 생몰년을 둘 다 모르면 발표 연도가 무엇이든(여기서는 1500 — 생몰년을
   * 안다면 명백히 배제될 값) 판단할 근거가 없다. 사망 연도 불명 자체는
   * `checkAuthor`가 따로 배제한다.
   */
  it("생몰년을 둘 다 모르면 통과시킨다", () => {
    expect(eraConsistent(1500, info(null, null))).toBe(true);
  });
});

describe("EXCLUSION_REASONS", () => {
  /** 동기화 스크립트가 이것으로 집계 객체를 만든다 — 손으로 적은 거울을 없앤다. */
  it("모든 사유를 담고 중복이 없다", () => {
    expect(EXCLUSION_REASONS).toContain("범위 밖 장르");
    expect(EXCLUSION_REASONS).toContain("해외 저자");
    expect(EXCLUSION_REASONS).toContain("저자 불명");
    expect(new Set(EXCLUSION_REASONS).size).toBe(EXCLUSION_REASONS.length);
  });
});
