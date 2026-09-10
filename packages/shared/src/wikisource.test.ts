import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  assertClean,
  MIN_BODY_CHARS,
  readEpubMetadata,
  stripEpub,
  toPageTitle,
} from "@ttokttok/shared/wikisource";

describe("toPageTitle", () => {
  it("문서 제목을 그대로 받는다", () => {
    expect(toPageTitle("운수 좋은 날")).toBe("운수 좋은 날");
  });

  it("앞뒤 공백을 떼고 밑줄을 공백으로 바꾼다", () => {
    expect(toPageTitle("  운수_좋은_날  ")).toBe("운수 좋은 날");
  });

  it("위키문헌 주소에서 문서 제목을 뽑는다", () => {
    expect(
      toPageTitle(
        "https://ko.wikisource.org/wiki/%EC%9A%B4%EC%88%98_%EC%A2%8B%EC%9D%80_%EB%82%A0",
      ),
    ).toBe("운수 좋은 날");
  });

  it("모바일 도메인도 받는다", () => {
    expect(toPageTitle("https://ko.m.wikisource.org/wiki/봄봄")).toBe("봄봄");
  });

  it("?title= 형태도 받는다", () => {
    expect(
      toPageTitle("https://ko.wikisource.org/w/index.php?title=날개&action=raw"),
    ).toBe("날개");
  });

  it("판본 괄호를 보존한다", () => {
    expect(toPageTitle("진달래꽃 (시집)")).toBe("진달래꽃 (시집)");
  });

  it("한국 위키문헌이 아닌 주소는 거부한다", () => {
    expect(() => toPageTitle("https://en.wikisource.org/wiki/Ulysses")).toThrow(
      /ko\.wikisource\.org/,
    );
  });

  it("문서 주소가 아니면 거부한다", () => {
    expect(() => toPageTitle("https://ko.wikisource.org/")).toThrow(/문서 주소/);
  });

  it("빈 입력은 거부한다", () => {
    expect(() => toPageTitle("   ")).toThrow(/입력/);
  });
});

/**
 * ws-export 출력의 최소 재현.
 *
 * 실물 EPUB(4.4MB)을 픽스처로 커밋하지 않는 이유: 용량의 대부분이 우리가
 * 지울 폰트이고, 검증하려는 건 "무엇을 지우고 참조를 어떻게 끊는가"라서
 * 구조만 있으면 충분하다. 구조는 실제 응답에서 확인한 것과 같다 —
 * OPS/ 아래 content.opf·nav.xhtml·toc.ncx·title.xhtml·about.xhtml,
 * `c0_` 접두 본문, images/·fonts/.
 */
function makeFixture(): Uint8Array {
  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>`,
    ),
    "OPS/content.opf": strToU8(
      `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">https://ko.wikisource.org/wiki/봄봄</dc:identifier>
<dc:title id="meta-title">운수 좋은 날</dc:title>
<dc:source>https://ko.wikisource.org/wiki/%EC%9A%B4%EC%88%98_%EC%A2%8B%EC%9D%80_%EB%82%A0</dc:source>
<dc:rights xml:lang="en">Creative Commons BY-SA 3.0</dc:rights>
<dc:contributor id="meta-bkp">Wikisource</dc:contributor>
</metadata>
<manifest>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml" />
<item id="about" href="about.xhtml" media-type="application/xhtml+xml" />
<item id="c0" href="c0_unsu.xhtml" media-type="application/xhtml+xml" />
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
<item id="css" href="main.css" media-type="text/css" />
<item id="logo" href="images/Wikisource-logo.svg.png" media-type="image/png" />
<item id="wplogo" href="images/c1_Wikipedia_logo_v2.svg.png" media-type="image/png" />
<item id="f1" href="fonts/FreeSerif.ttf" media-type="application/font-sfnt" />
</manifest>
<spine toc="ncx">
<itemref idref="title" />
<itemref idref="c0" />
<itemref idref="about" />
</spine>
</package>`,
    ),
    "OPS/nav.xhtml": strToU8(
      `<html><body><nav epub:type="toc"><ol>
<li id="toc-title"><a href="title.xhtml">표지</a></li>
<li id="toc-c0"><a href="c0_unsu.xhtml">운수 좋은 날</a></li>
<li id="toc-about"><a href="about.xhtml">정보</a></li>
</ol></nav></body></html>`,
    ),
    "OPS/toc.ncx": strToU8(
      `<ncx><navMap>
<navPoint id="title"><navLabel><text>표지</text></navLabel><content src="title.xhtml"/></navPoint>
<navPoint id="c0"><navLabel><text>운수 좋은 날</text></navLabel><content src="c0_unsu.xhtml"/></navPoint>
<navPoint id="about"><navLabel><text>정보</text></navLabel><content src="about.xhtml"/></navPoint>
</navMap></ncx>`,
    ),
    "OPS/title.xhtml": strToU8(
      `<html><body><img src="images/Wikisource-logo.svg.png"/></body></html>`,
    ),
    "OPS/about.xhtml": strToU8(
      `<html><body><h1>정보</h1><img src="images/c1_Wikipedia_logo_v2.svg.png"/></body></html>`,
    ),
    // 라이선스 상자는 섹션 안에 「라이선스」 제목과 함께 들어 있고,
    // 상자 자체가 div로 여러 겹 중첩돼 있다. 본문 문단은 MIN_BODY_CHARS
    // 문턱을 넘기려고 LONG_PROSE를 쓴다(아래 LONG_PROSE 주석 참고) —
    // 라이선스 섹션은 strip이 지우므로 문턱을 넘겨야 하는 건 이 문단뿐이다.
    "OPS/c0_unsu.xhtml": strToU8(
      `<html><body>
<section data-mw-section-id="0"><p>${LONG_PROSE}</p></section>
<section data-mw-section-id="1"><h2>라이선스</h2>
<div class="licenseContainer licenseBanner"><div class="inner"><div class="deep">CC BY-SA 3.0</div></div></div>
</section>
</body></html>`,
    ),
    "OPS/main.css": strToU8(
      `@font-face { font-family: "FreeSerif"; src: url(fonts/FreeSerif.ttf); }
body { margin: 0; }
.licenseContainer { border: 1px solid; }`,
    ),
    "OPS/images/Wikisource-logo.svg.png": new Uint8Array([1, 2, 3]),
    "OPS/images/c1_Wikipedia_logo_v2.svg.png": new Uint8Array([4, 5, 6]),
    "OPS/fonts/FreeSerif.ttf": new Uint8Array(1024),
  };
  return zipSync(files, { level: 6 });
}

/**
 * MIN_BODY_CHARS(500자) 포팅 이후 여러 픽스처가 재사용하는 실감 본문.
 *
 * 아래 여러 테스트는 원래 자기 검사(인코딩 방향, 무결성, 고아 제목 판정
 * 등 — 전부 글자수와 무관하다)와 상관없이 몇 글자짜리 본문을 픽스처로
 * 썼다. `assertClean`에 최소 글자수 검사가 새로 생기면서 그 픽스처들이
 * 검사 대상과 무관하게 "빈 껍데기" 판정에 걸리게 됐다 — 그래서 그 검사와
 * 무관한 테스트는 본문만 이 긴 텍스트로 바꿔 새 문턱을 넘긴다(검증하는
 * 내용 자체는 그대로 둔다).
 */
const LONG_PROSE_PART1 = `새침하게 흐린 품이 눈이 올 듯하더니 눈은 아니 오고 진눈깨비가 추적추적 흩날리는 날이었다. 거리로 나선 지 얼마 지나지 않아 손끝이 얼어붙는 듯했지만 오늘 날씨쯤이야 대수롭지 않게 여기며 발걸음을 재촉했다. 지나가는 사람들은 저마다 옷깃을 여미고 종종걸음으로 골목을 빠져나갔고, 낡은 처마 밑으로 빗물이 뚝뚝 떨어지는 소리만이 적막을 메웠다. 멀리서 장사치들의 외침이 간간이 들려오다가도 이내 바람 소리에 묻혀 사라졌다. 집을 나설 때 걱정하던 일들이 자꾸 머릿속을 맴돌았지만, 그는 애써 딴생각을 떨쳐내며 오늘 하루만큼은 무탈하게 지나가기를 마음속으로 빌었다. 그렇게 얼마를 걸었을까, 저 멀리 손을 드는 사람이 보이자 그의 발걸음은 자기도 모르게 빨라졌다.`;
const LONG_PROSE_PART2 = `그러나 막상 다가가 보니 손을 든 것은 행인이 아니라 처마 밑에서 비를 피하려 애쓰던 노인이었고, 김 서방은 헛웃음을 지으며 다시 발길을 돌렸다. 하루 종일 이런 식으로 헛걸음만 반복되니 주머니는 좀처럼 무거워지지 않았고, 해는 어느새 뉘엿뉘엿 저물어 갔다. 그래도 그는 포기하지 않고 정거장 쪽으로 발걸음을 옮기며 오늘 하루의 마지막 운을 시험해 보기로 했다. 정거장에 다다르니 마침 기차가 막 도착한 참이라 짐을 든 손님들이 우르르 쏟아져 나왔다. 그는 재빨리 인력거를 세우고 목청을 가다듬어 손님을 불러 모았다. 다행히 한 신사가 선뜻 그의 인력거에 올라탔고, 김 서방은 오랜만에 느끼는 든든함에 온몸의 피로가 잠시나마 가시는 듯했다. 비록 삯이 넉넉지는 않았으나 오늘 하루를 버틸 수 있다는 사실만으로도 그는 마음이 놓였다.`;
/** 한 챕터에 다 담을 때 쓴다 — 두 조각 합쳐 500자를 넉넉히 넘는다. */
const LONG_PROSE = `${LONG_PROSE_PART1} ${LONG_PROSE_PART2}`;

/**
 * 라이선스 조문처럼 읽히는 실감 본문(500자 이상) — 「라이선스」 제목
 * 뒤에 진짜 산문이 있는 정당한 문서를 흉내 낸 테스트에서 쓴다.
 */
const LONG_LICENSE_PROSE = `이 문서의 배포 조건은 다음과 같다. 제1조 이 저작물은 크리에이티브 커먼즈 저작자표시-동일조건변경허락 3.0 라이선스에 따라 이용할 수 있다. 제2조 이용자는 저작물을 복제·배포·전송·공연·전시할 수 있으며, 이차적 저작물을 작성할 수 있다. 제3조 이용자는 반드시 원저작자를 표시해야 하며, 이 저작물을 이용하여 만든 이차적 저작물에는 동일한 라이선스를 적용해야 한다. 제4조 상업적 목적으로 이용하는 경우에도 별도의 허락 없이 이용할 수 있으나, 저작인격권은 침해되지 않는다. 제5조 이 조건에 동의하지 않는 경우 저작물을 이용할 수 없다. 제6조 이 문서를 인용하거나 재배포할 때에는 출처와 원문 주소를 함께 밝혀야 하며, 내용을 임의로 변경하여 원저작자의 뜻을 왜곡해서는 안 된다. 제7조 번역본을 작성하는 경우에도 원문의 저작권 표시와 라이선스 조건을 그대로 유지해야 하고, 번역자는 자신의 번역에 대한 권리를 별도로 주장할 수 없다. 제8조 이 조건은 문서가 개정되기 전까지 계속 유효하다. 제9조 이 조건에 대한 해석에 다툼이 있는 경우에는 원문 라이선스 조항의 원어 표현을 기준으로 한다. 제10조 이 문서의 전자책 판본을 제작·배포하는 주체는 이 조건 전문을 함께 실어야 하며, 임의로 축약하거나 생략할 수 없다. 제11조 이 조건은 사전 통지 없이 개정될 수 있으며, 개정된 조건은 공고 즉시 효력을 가진다. 제12조 이 조건과 관련하여 발생하는 모든 분쟁은 원저작자가 속한 국가의 법령을 우선 적용하여 해결한다.`;

/**
 * `stripLicenseBlocks`가 보는 파일 하나만 담은 최소 EPUB.
 * 라이선스 상자의 위치별 변형(섹션 유무 등)을 확인할 때 `makeFixture`의
 * 15개 항목을 통째로 복제하지 않으려고 쓴다.
 */
function makeSingleFileEpub(path: string, content: string): Uint8Array {
  return zipSync({
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    [path]: strToU8(content),
  });
}

/**
 * 실물 ws-export 챕터 문서의 최소 재현 — 「운수 좋은 날」 EPUB에서 확인한
 * 대로 `<head>`에 `<meta>`·`<link rel="stylesheet">`·`<title>`과, CSS
 * 텍스트가 그대로 들어간 인라인 `<style>`(mw:Extension/templatestyles)을
 * 갖췄다. `assertClean`의 챕터-공백 검사가 파일 전체가 아니라 `<body>`
 * 안쪽만 봐야 하는 이유가 이 모양이다 — `<head>`가 빠진 픽스처로는 그
 * 버그가 재현되지 않는다.
 */
function makeChapterXhtml(bodyInner: string): string {
  return `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" dir="ltr"><head><meta charset="UTF-8"/>
<link type="text/css" rel="stylesheet" href="main.css"/><title>운수 좋은 날</title>
<style typeof="mw:Extension/templatestyles" about="#mwt3"><![CDATA[.mw-parser-output
.wst-header-mainblock{margin:4px auto 4px auto;padding:0 3px;display:flex;}
]]></style>
</head><body>${bodyInner}</body></html>`;
}

/**
 * 실물 「운수 좋은 날」 챕터 문서의 `<head>`를 그대로 재현한다 — `<style>`
 * 블록이 **두 개**다. 하나는 `.mw-parser-output .licenseContainer{…}`
 * 규칙으로 시작해 무관한 규칙이 뒤따르고, 다른 하나는 처음부터 무관한
 * 규칙만 담는다(실측한 그대로의 모양). `makeChapterXhtml`은 `<style>`이
 * 하나뿐이고 licenseContainer도 없어서, 정리 정규식이 여는 태그와 CDATA
 * 시작 마커까지 삼키는 이 결함을 재현하지 못한다 — 그래서 이 결함
 * 전용으로 따로 둔다.
 */
function makeChapterXhtmlWithLicenseCss(bodyInner: string): string {
  return `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" dir="ltr"><head><meta charset="UTF-8"/>
<link type="text/css" rel="stylesheet" href="main.css"/><title>운수 좋은 날</title>
<style typeof="mw:Extension/templatestyles" about="#mwt7"><![CDATA[.mw-parser-output .licenseContainer{box-sizing:border-box;margin-top:1em;padding:.5em 1em;}
.mw-parser-output .wst-pd-icon{width:1.5em;height:1.5em;}
]]></style>
<style typeof="mw:Extension/templatestyles" about="#mwt8"><![CDATA[.mw-parser-output .wst-header-mainblock{margin:4px auto 4px auto;padding:0 3px;display:flex;}
]]></style>
</head><body>${bodyInner}</body></html>`;
}

/**
 * 실물 「운수 좋은 날」 EPUB에서 실측한 라이선스 CSS 선택자 모양 — 자식
 * 결합자(`>`)가 낀다(`.licenseContainer>div:first-of-type{…}`, 실측
 * 15개). `<`·`>`를 뺀 문자 집합으로 좁힌 예전 정규식은 이 모양의 선택자를
 * 애초에 매치할 수 없어 CSS 텍스트 안에 그대로 남았는데, `assertClean`의
 * 예전 검사(`licenseContainer` 문자열 검색)는 본문 전체를 보므로 이 죽은
 * 선택자에도 걸려 실제 책 반입이 막혔다 — 이 모듈이 고치는 바로 그 문제.
 */
function makeChapterXhtmlWithLicenseCssSelector(bodyInner: string): string {
  return `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" dir="ltr"><head><meta charset="UTF-8"/>
<link type="text/css" rel="stylesheet" href="main.css"/><title>운수 좋은 날</title>
<style typeof="mw:Extension/templatestyles" about="#mwt7"><![CDATA[.mw-parser-output .licenseContainer>div:first-of-type{display:table;margin:0 auto;}
.mw-parser-output .wst-pd-icon{width:1.5em;height:1.5em;}
]]></style>
</head><body>${bodyInner}</body></html>`;
}

const read = (epub: Uint8Array) => {
  const entries = unzipSync(epub);
  return {
    paths: Object.keys(entries),
    text: (p: string) => strFromU8(entries[p]),
  };
};

describe("stripEpub", () => {
  it("폰트 파일과 @font-face 선언을 지운다", () => {
    const { paths, text } = read(stripEpub(makeFixture()));
    expect(paths.some((p) => /fonts\//.test(p))).toBe(false);
    expect(text("OPS/main.css")).not.toMatch(/@font-face/);
    expect(text("OPS/main.css")).toMatch(/body \{ margin: 0; \}/);
  });

  it("표지·정보 페이지와 로고 이미지를 지운다", () => {
    const { paths } = read(stripEpub(makeFixture()));
    expect(paths).not.toContain("OPS/title.xhtml");
    expect(paths).not.toContain("OPS/about.xhtml");
    expect(paths).not.toContain("OPS/images/Wikisource-logo.svg.png");
    expect(paths).not.toContain("OPS/images/c1_Wikipedia_logo_v2.svg.png");
  });

  it("본문 챕터는 남긴다", () => {
    const { paths, text } = read(stripEpub(makeFixture()));
    expect(paths).toContain("OPS/c0_unsu.xhtml");
    expect(text("OPS/c0_unsu.xhtml")).toMatch(/새침하게 흐린 품이/);
  });

  it("지운 파일의 manifest 항목과 spine 참조를 함께 끊는다", () => {
    const opf = read(stripEpub(makeFixture())).text("OPS/content.opf");
    expect(opf).not.toMatch(/title\.xhtml/);
    expect(opf).not.toMatch(/about\.xhtml/);
    expect(opf).not.toMatch(/fonts\/FreeSerif\.ttf/);
    expect(opf).not.toMatch(/idref="title"/);
    expect(opf).not.toMatch(/idref="about"/);
    expect(opf).toMatch(/idref="c0"/);
  });

  it("nav.xhtml과 toc.ncx의 목차 항목을 끊는다", () => {
    const { text } = read(stripEpub(makeFixture()));
    expect(text("OPS/nav.xhtml")).not.toMatch(/표지/);
    expect(text("OPS/nav.xhtml")).not.toMatch(/정보/);
    expect(text("OPS/nav.xhtml")).toMatch(/운수 좋은 날/);
    expect(text("OPS/toc.ncx")).not.toMatch(/title\.xhtml/);
    expect(text("OPS/toc.ncx")).not.toMatch(/about\.xhtml/);
    expect(text("OPS/toc.ncx")).toMatch(/c0_unsu\.xhtml/);
  });

  it("중첩된 라이선스 상자를 「라이선스」 제목까지 통째로 지운다", () => {
    const body = read(stripEpub(makeFixture())).text("OPS/c0_unsu.xhtml");
    expect(body).not.toMatch(/licenseContainer/);
    expect(body).not.toMatch(/라이선스/);
    expect(body).not.toMatch(/CC BY-SA/);
    // 본문 섹션은 살아 있어야 한다 — 섹션 단위로 지우므로 실수하기 쉽다.
    expect(body).toMatch(/새침하게 흐린 품이/);
  });

  it("라이선스 상자가 섹션 없이 div만 붙어도, 이미 끝난 본문 섹션은 남긴다", () => {
    // 상자를 감싸는 섹션이 없는 판본 — 상자 앞의 마지막 <section>은 이미
    // 닫힌 뒤라, 그 섹션째 지우면 안 된다(Finding 1).
    const epub = makeSingleFileEpub(
      "OPS/c0_test.xhtml",
      `<html><body>
<section id="0"><p>새침하게 흐린 품이 눈이 올 듯하더니</p></section>
<div class="licenseContainer">CC BY-SA 3.0</div>
</body></html>`,
    );
    const body = read(stripEpub(epub)).text("OPS/c0_test.xhtml");
    expect(body).toMatch(/새침하게 흐린 품이/);
    expect(body).not.toMatch(/licenseContainer/);
    expect(body).not.toMatch(/CC BY-SA/);
  });

  it("라이선스 상자가 본문과 같은 섹션에 있어도 본문 문단은 남긴다", () => {
    // 상자가 진짜 본문과 한 섹션에 얹힌 판본 — 섹션째 지우면 문단까지
    // 사라진다(Finding 1). 이때는 상자만 지워야 한다.
    const epub = makeSingleFileEpub(
      "OPS/c0_test.xhtml",
      `<html><body>
<section id="0"><p>본문 첫 문장이다.</p><div class="licenseContainer">CC BY-SA 3.0</div></section>
</body></html>`,
    );
    const body = read(stripEpub(epub)).text("OPS/c0_test.xhtml");
    expect(body).toMatch(/본문 첫 문장이다/);
    expect(body).not.toMatch(/licenseContainer/);
    expect(body).not.toMatch(/CC BY-SA/);
  });

  it("스타일시트는 손대지 않는다 — 주석 속 'license' 문구가 다음 규칙까지 삼키지 않게", () => {
    // .css 브랜치는 더 이상 stripLicenseBlocks를 타지 않는다(Finding 2).
    // 그 함수의 CSS 정리 정규식은 직전 '}'에만 걸려서, 주석에 낀 "license"
    // 한 단어가 바로 다음 규칙(body)까지 통째로 삼켜 버린다.
    const epub = makeSingleFileEpub(
      "OPS/main.css",
      `/* Wikisource export stylesheet, released under a free license (CC BY-SA 3.0) */
body { margin: 0; font-family: serif; }
p { text-indent: 1em; }
.licenseContainer { border: 1px solid; }`,
    );
    const css = read(stripEpub(epub)).text("OPS/main.css");
    expect(css).toMatch(/body \{ margin: 0; font-family: serif; \}/);
    expect(css).toMatch(/p \{ text-indent: 1em; \}/);
  });

  it("dc:rights와 dc:contributor 메타데이터는 남긴다", () => {
    const opf = read(stripEpub(makeFixture())).text("OPS/content.opf");
    expect(opf).toMatch(/Creative Commons BY-SA 3\.0/);
    expect(opf).toMatch(/<dc:contributor[^>]*>Wikisource<\/dc:contributor>/);
  });

  it("mimetype을 첫 항목으로, 무압축으로 남긴다", () => {
    const out = stripEpub(makeFixture());
    expect(Object.keys(unzipSync(out))[0]).toBe("mimetype");
    // zip 로컬 파일 헤더: 0~3 서명, 8~9 압축 방식. 0이면 stored(무압축).
    expect(out[0]).toBe(0x50);
    expect(out[1]).toBe(0x4b);
    expect(out[8] | (out[9] << 8)).toBe(0);
  });
});

/**
 * stripLicenseBlocks — 전제부(preface) 판정을 태그 구조가 아니라 글자로
 * 해야 하는 이유(고아 「라이선스」 제목, 실물 입력에서 발견).
 *
 * 실제 ws-export가 「운수 좋은 날」에 대해 만든 원본 마크업을 그대로 쓴다.
 * 상자(licenseContainer) 앞에 <h2>라이선스</h2> 제목과, 글자가 전혀 없는
 * MediaWiki 트랜스클루전 마커 `<span class="mw-empty-elt" .../>`가 붙는다.
 * 예전의 "제목 태그 하나, 또는 아무 것도 없음"이라는 *구조* 검사는 이 마커
 * 태그 하나 때문에 "제목 말고 다른 내용이 있다"고 오판해 상자만 지우고
 * 제목을 고아로 남겼다 — 문장이 추가돼서가 아니라, 글자 없는 태그 하나
 * 때문에.
 */
describe("stripLicenseBlocks — 실물 마크업의 전제부 판정", () => {
  it("전제부가 제목 + 글자 없는 트랜스클루전 마커뿐이면 섹션째(제목 포함) 지운다", () => {
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      `<html><body>
<section data-mw-section-id="0"><p>새침하게 흐린 품이 눈이 올 듯하더니</p></section>
<section data-mw-section-id="1"><h2 id="laiseonseu"><span id="id-.EB.9D.BC.EC.9D.B4.EC.84.A0.EC.8A.A4" typeof="mw:FallbackId"/>라이선스</h2>
<span class="mw-empty-elt" about="#mwt6" typeof="mw:Transclusion"/><div class="licenseContainer licenseBanner dynlayout-exempt " about="#mwt6"><div class="inner">CC BY-SA 3.0</div></div></section>
</body></html>`,
    );
    const body = read(stripEpub(epub)).text("OPS/c0_unsu.xhtml");
    expect(body).not.toMatch(/라이선스/);
    expect(body).not.toMatch(/licenseContainer/);
    expect(body).not.toMatch(/mw-empty-elt/);
    // 앞 섹션의 본문 문단은 살아 있어야 한다 — 다른 섹션까지 지우면 안 된다.
    expect(body).toMatch(/새침하게 흐린 품이/);
  });

  it("전제부에 실제 산문이 섞이면(제목만이 아니면) 상자만 지우고 그 산문은 남긴다(가드 회귀 방지)", () => {
    // 태그가 아니라 글자로 판정하더라도, 진짜 산문이 있으면 여전히
    // 섹션째 지우면 안 된다 — 예전에 본문을 지웠던 버그의 재발 방지 가드.
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      `<html><body>
<section data-mw-section-id="1"><h2 id="laiseonseu"><span id="id-x" typeof="mw:FallbackId"/>라이선스</h2>
<p>이 챕터는 실제로 라이선스 조건을 설명하는 산문 문단을 담고 있다.</p><div class="licenseContainer licenseBanner dynlayout-exempt " about="#mwt6"><div class="inner">CC BY-SA 3.0</div></div></section>
</body></html>`,
    );
    const body = read(stripEpub(epub)).text("OPS/c0_unsu.xhtml");
    expect(body).toMatch(
      /이 챕터는 실제로 라이선스 조건을 설명하는 산문 문단을 담고 있다/,
    );
    expect(body).not.toMatch(/licenseContainer/);
    expect(body).not.toMatch(/CC BY-SA/);
  });
});

/**
 * stripLicenseBlocks — `<style>` 태그·CDATA 마커를 먹지 않는다
 * (실물 「운수 좋은 날」 EPUB에서 발견된 결함의 회귀 방지).
 *
 * 예전엔 여기서 CSS 규칙(`.licenseContainer{…}`)도 정규식으로 지우려 했다.
 * 그 정규식을 챕터 전체가 아니라 `<style>…</style>` 매치 문자열에만
 * 걸었어도, 그 매치 문자열 자체가 여는 태그·CDATA 시작 마커를 포함하고
 * 있어서 "중괄호 아닌 글자"로 그 마커까지 삼켰다. 실측: 한 챕터에서
 * `<style>` 2개·`</style>` 2개·`<![CDATA[` 2개·`]]>` 2개였던 입력이, 정리
 * 뒤 `<style>` 1개·`<![CDATA[` 1개로 줄고 `</style>`·`]]>`는 그대로
 * 2개씩 남아 `]]></style>` 하나가 짝 없는 고아가 됐다. EPUB 챕터는 XML로
 * 파싱되므로 엄격한 리더는 이걸 못 열고, 관대한 리더는 `]]>`를 화면에
 * 그대로 찍는다.
 *
 * 지금은 CSS 규칙 제거 자체를 접었으므로(위 `stripLicenseBlocks` 주석
 * 참고) `<style>` 안쪽은 아예 건드리지 않는다 — 그래서 태그·마커가 안
 * 먹히는 건 당연하지만, 다음에 누가 CSS 정리를 되살리고 싶어질 때를 대비해
 * 이 회귀 방지 테스트는 남겨 둔다.
 */
describe("stripLicenseBlocks — style 태그·CDATA 마커를 먹지 않는다", () => {
  it("stripEpub 뒤에도 style 태그·CDATA 마커 개수가 그대로 짝이 맞고, style 밖에 고아 ]]>가 없다", () => {
    const chapter = makeChapterXhtmlWithLicenseCss(
      "<p>새침하게 흐린 품이 눈이 올 듯하더니</p>",
    );
    const epub = makeSingleFileEpub("OPS/c0_unsu.xhtml", chapter);
    const out = read(stripEpub(epub)).text("OPS/c0_unsu.xhtml");

    const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;
    expect(count(/<style\b/gi, out)).toBe(2);
    expect(count(/<\/style>/gi, out)).toBe(2);
    expect(count(/<!\[CDATA\[/g, out)).toBe(2);
    expect(count(/\]\]>/g, out)).toBe(2);

    // <style>…</style> 블록을 전부 도려낸 나머지에 `]]>`가 하나라도 남으면
    // 그건 style 밖으로 새어 나온 고아 CDATA 종료 마커라는 뜻이다.
    const outsideStyle = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    expect(outsideStyle).not.toMatch(/\]\]>/);
  });

  it("CSS 규칙은 이제 지우지 않는다 — licenseContainer 선택자를 포함해 모든 규칙이 글자 그대로 남는다", () => {
    // 예전 계약: "licenseContainer가 든 규칙만 지우고 나머지는 남긴다".
    // 새 계약(Problem B): CSS 규칙 제거 자체를 접었으므로 licenseContainer
    // 규칙도 더는 지우지 않는다 — 상자(태그)만 지우면 되고, 죽은 CSS
    // 규칙은 화면에 아무것도 그리지 않으므로 감수한다.
    const chapter = makeChapterXhtmlWithLicenseCss("<p>본문</p>");
    const epub = makeSingleFileEpub("OPS/c0_unsu.xhtml", chapter);
    const out = read(stripEpub(epub)).text("OPS/c0_unsu.xhtml");

    // licenseContainer 선택자 자체가 이제 그대로 남는다.
    expect(out).toMatch(
      /\.mw-parser-output \.licenseContainer\{box-sizing:border-box;margin-top:1em;padding:\.5em 1em;\}/,
    );
    // 같은 블록의 무관한 규칙도 여전히 그대로.
    expect(out).toMatch(
      /\.mw-parser-output \.wst-pd-icon\{width:1\.5em;height:1\.5em;\}/,
    );
    // 두 번째 <style> 블록(라이선스 규칙이 아예 없던 블록)도 그대로.
    expect(out).toMatch(
      /\.mw-parser-output \.wst-header-mainblock\{margin:4px auto 4px auto;padding:0 3px;display:flex;\}/,
    );
    // <style> 여는 태그와 CDATA 시작 마커도 살아 있어야 한다.
    expect(out).toMatch(/<style typeof="mw:Extension\/templatestyles" about="#mwt7">/);
    expect(out).toMatch(/<!\[CDATA\[/);
  });
});

describe("assertClean — style 태그 짝 검사", () => {
  it("<style> 닫는 태그가 여는 태그보다 하나 더 많은 챕터는 실패한다", () => {
    // stripLicenseBlocks를 거치지 않고, 결함이 실제로 남기는 산출물의
    // 모양(여는 태그 없이 닫는 태그만 하나 더 남은 상태)을 직접 조립한다.
    const broken = makeChapterXhtml("<p>본문</p>") + "</style>";
    const epub = makeSingleFileEpub("OPS/c0_unsu.xhtml", broken);
    expect(() => assertClean(epub)).toThrow(/style 태그 개수가 안 맞음/);
  });
});

/**
 * assertClean — 라이선스 상자 판정을 문자열이 아니라 태그로 한다
 * (실물 「운수 좋은 날」 EPUB에서 발견 — 이번 수정의 핵심 결함).
 *
 * `assertClean`은 예전에 챕터 본문 전체에서 `licenseContainer`라는
 * *문자열*을 찾았다. 상자(`<div class="…licenseContainer…">`)는
 * stripLicenseBlocks가 정상적으로 지우지만, `<head>`의 인라인 `<style>`
 * CDATA 안에는 `.mw-parser-output .licenseContainer>div:first-of-type{…}`
 * 같은 죽은 CSS 선택자가 그대로 남는다(Problem B — CSS 규칙 제거는 두 번
 * 사고를 내고 접었다, `stripLicenseBlocks` 주석 참고). 문자열 검사는 이
 * 죽은 선택자에도 그대로 걸려서, 상자가 이미 없어졌고 화면에 아무것도
 * 그려지지 않는데도 "라이선스 상자"라며 실패했다 — 실물 「운수 좋은 날」을
 * 반입할 수 없게 만든 바로 그 증상이다.
 *
 * 그래서 문자열 검사를 태그 판정으로 바꾼다 — 다만 여기서 한 번 더
 * 잘못짚었다. 처음엔 stripLicenseBlocks가 상자를 *찾을 때* 쓰는 정규식
 * (`LICENSE_OPEN`)을 게이트에 그대로 재사용했는데, 최종 리뷰(Finding 1)가
 * 지적한 대로 그건 strip의 사각지대를 게이트가 그대로 물려받는 셈이다 —
 * `LICENSE_OPEN`이 놓치는 모양(작은따옴표 class, section·div가 아닌 태그
 * 등)은 strip도 못 지우고 게이트도 못 잡는다. 그래서 지금은 게이트를
 * `LICENSE_OPEN`과 무관한, 더 넓은(더 엄격한) 판정으로 다시 바꿨다 —
 * 태그 종류·따옴표 종류를 아예 안 보고 "licenseContainer를 담은 class
 * 속성이 있는가"만 본다(`assertClean` 안의 주석 참고). 게이트는 항상
 * strip보다 엄격해야 한다는 원칙은 그대로다 — 다만 "엄격함"을 strip의
 * 어휘를 재사용해서 만들 수는 없다는 게 이번에 새로 확인된 부분이다.
 */
describe("assertClean — 라이선스 상자 판정을 태그로(CSS 선택자 생존을 오판하지 않는다)", () => {
  it("본문 상자는 지워지고, style CDATA에 남은 .licenseContainer>… 선택자는 손대지 않으며, assertClean이 통과한다", () => {
    // 실물 그대로: <style> CDATA에 자식 결합자(>)가 낀 라이선스 선택자가
    // 있고, 본문에는 실제 라이선스 상자(제목 + div)가 따로 있다.
    // 본문 문단은 LONG_PROSE를 쓴다 — MIN_BODY_CHARS 문턱을 넘겨야 이
    // 테스트가 검증하려는 CSS 선택자 생존 여부와 무관한 이유로 실패하지
    // 않는다.
    const chapter = makeChapterXhtmlWithLicenseCssSelector(
      `<section data-mw-section-id="0"><p>${LONG_PROSE}</p></section>
<section data-mw-section-id="1"><h2>라이선스</h2>
<div class="licenseContainer licenseBanner"><div class="inner"><div class="deep">CC BY-SA 3.0</div></div></div>
</section>`,
    );
    const epub = makeSingleFileEpub("OPS/c0_unsu.xhtml", chapter);
    const stripped = stripEpub(epub);
    const out = read(stripped).text("OPS/c0_unsu.xhtml");

    // 본문 상자와 「라이선스」 제목은 사라진다 — stripLicenseBlocks의 기존
    // 동작(태그 제거)은 이번 변경으로 건드리지 않았다.
    expect(out).not.toMatch(/<(section|div)\b[^>]*class="[^"]*licenseContainer[^"]*"/);
    expect(out).not.toMatch(/라이선스/);
    expect(out).toMatch(/새침하게 흐린 품이/);

    // style CDATA의 CSS 선택자는 손대지 않고 글자 그대로 남는다 — > 자식
    // 결합자 포함(Problem B: CSS 규칙 제거를 아예 접었다).
    expect(out).toMatch(
      /\.mw-parser-output \.licenseContainer>div:first-of-type\{display:table;margin:0 auto;\}/,
    );

    // style 태그·CDATA 마커 짝도 그대로 맞는다.
    const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;
    expect(count(/<style\b/gi, out)).toBe(1);
    expect(count(/<\/style>/gi, out)).toBe(1);
    expect(count(/<!\[CDATA\[/g, out)).toBe(1);
    expect(count(/\]\]>/g, out)).toBe(1);

    // 이게 실물 「운수 좋은 날」에서 막혔던 지점이다 — 죽은 CSS 선택자
    // 때문에 상자가 없는데도 게이트가 던졌다. 고친 뒤에는 통과해야 한다.
    // (고치기 전 코드에서 이 assertion이 실패하는지는 리포트에 기록했다.)
    expect(() => assertClean(stripped)).not.toThrow();
  });

  it("실제 라이선스 상자(<div class=\"licenseContainer …\">)가 남아 있으면 여전히 실패한다", () => {
    // 게이트를 문자열에서 태그 판정으로 바꿨다고 해서 진짜 상자를 놓치면
    // 안 된다 — stripLicenseBlocks를 거치지 않은, 상자가 그대로 있는
    // 챕터를 assertClean에 바로 먹인다.
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      makeChapterXhtml(
        `<div class="licenseContainer licenseBanner"><div class="inner">CC BY-SA 3.0</div></div>`,
      ),
    );
    expect(() => assertClean(epub)).toThrow(/라이선스 상자/);
  });
});

/**
 * assertClean — 상자 게이트는 strip의 사각지대를 그대로 물려받으면 안 된다
 * (최종 리뷰 Finding 1).
 *
 * 위 describe 블록에서 태그 판정으로 바꾸며 `LICENSE_OPEN`(strip이 상자를
 * *찾을 때* 쓰는 정규식)을 게이트에도 그대로 재사용했다. 그런데
 * `LICENSE_OPEN`은 `(section|div)` 태그 + 큰따옴표 `class="…"`만 본다 —
 * strip이 못 지우는 모양(작은따옴표 class, table 같은 다른 태그)은
 * `LICENSE_OPEN`도 못 잡으므로 게이트도 그대로 놓친다. "strip이 못 지우면
 * 게이트가 잡는다"는 게이트의 존재 이유 자체가 strip과 어휘를 공유하는
 * 순간 무너진다.
 *
 * 두 테스트 다 「라이선스」 제목 없이 상자만 둔다 — 제목이 있으면 고아 제목
 * 검사(Finding 4 위쪽)가 우연히 대신 잡아 버려서, 상자 검사 자체가
 * 독립적으로 작동하는지 시험할 수 없다(실물에서도 템플릿마다 제목 유무가
 * 다르다).
 */
describe("assertClean — 상자 게이트가 strip의 사각지대를 물려받지 않는다(Finding 1)", () => {
  it("작은따옴표 class(<div class='licenseContainer'>)도 상자로 잡는다", () => {
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      makeChapterXhtml(`<div class='licenseContainer'>CC BY-SA 3.0</div>`),
    );
    expect(() => assertClean(epub)).toThrow(/라이선스 상자/);
  });

  it("div가 아닌 태그(<table class=\"licenseContainer\">)도 상자로 잡는다", () => {
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      makeChapterXhtml(
        `<table class="licenseContainer"><tr><td>CC BY-SA 3.0</td></tr></table>`,
      ),
    );
    expect(() => assertClean(epub)).toThrow(/라이선스 상자/);
  });
});

/**
 * assertClean — `hrefMatchesPath`의 인코딩 방향(최종 리뷰 Finding 2).
 *
 * `droppedHref`(stripEpub)는 raw basename을 인코딩해서 인코딩된 href와
 * 비교한다 — 맞는 방향이다. `hrefMatchesPath`는 반대로 href 쪽을
 * `encodeURI`했는데, href가 이미 퍼센트 인코딩돼 있으면(위키문헌 문서
 * 제목 대부분이 한글이라 실제로 이렇다) `encodeURI("c0_%EC%9A%B4…")`가
 * `%`를 `%25`로 다시 인코딩해 아무것도 매치하지 못한다. 대상 문서 9개 중
 * 8개가 한글 제목이라 이건 구석 사례가 아니다.
 */
describe("assertClean — hrefMatchesPath 인코딩 방향(Finding 2)", () => {
  it("퍼센트 인코딩된 한글 href가 실제 챕터 파일과 매치한다", () => {
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/content.opf": strToU8(
        `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>테스트</dc:title></metadata>
<manifest>
<item id="c0" href="c0_%EC%9A%B4%EC%88%98.xhtml" media-type="application/xhtml+xml" />
</manifest>
<spine>
<itemref idref="c0" />
</spine>
</package>`,
      ),
      // 본문은 LONG_PROSE를 쓴다 — MIN_BODY_CHARS 문턱을 넘겨야 이 테스트가
      // 검증하려는 href 인코딩 방향과 무관한 이유로 실패하지 않는다.
      "OPS/c0_운수.xhtml": strToU8(makeChapterXhtml(`<p>${LONG_PROSE}</p>`)),
    };
    const epub = zipSync(files);
    expect(() => assertClean(epub)).not.toThrow();
  });

  it("href의 './' 상대 경로 표기를 정규화해서 매치한다", () => {
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/content.opf": strToU8(
        `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>테스트</dc:title></metadata>
<manifest>
<item id="c0" href="./c0_a.xhtml" media-type="application/xhtml+xml" />
</manifest>
<spine>
<itemref idref="c0" />
</spine>
</package>`,
      ),
      // 본문은 LONG_PROSE를 쓴다 — MIN_BODY_CHARS 문턱을 넘겨야 이 테스트가
      // 검증하려는 './' 상대 경로 정규화와 무관한 이유로 실패하지 않는다.
      "OPS/c0_a.xhtml": strToU8(makeChapterXhtml(`<p>${LONG_PROSE}</p>`)),
    };
    const epub = zipSync(files);
    expect(() => assertClean(epub)).not.toThrow();
  });
});

/**
 * assertClean — `hrefMatchesPath`의 접미사 오매칭(최종 리뷰 Finding 3).
 *
 * 접미사(`endsWith`) 비교만으로는 "title.xhtml"이 우연히 같은 접미사로
 * 끝나는 무관한 파일("c2_subtitle.xhtml" — "subtitle"이 "title"로
 * 끝난다)까지 매치해 버린다. 댕글링 href가 엉뚱한 챕터로 "해소"되면서
 * 무결성 검사가 스스로 만든 접미사 충돌을 스스로는 못 잡는다.
 */
describe("assertClean — hrefMatchesPath 접미사 오매칭(Finding 3)", () => {
  it("댕글링 href(title.xhtml)가 접미사만 같은 챕터(c2_subtitle.xhtml)로 해소되면 안 된다", () => {
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/content.opf": strToU8(
        `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>테스트</dc:title></metadata>
<manifest>
<item id="t" href="title.xhtml" media-type="application/xhtml+xml" />
</manifest>
<spine>
<itemref idref="t" />
</spine>
</package>`,
      ),
      // title.xhtml 자신은 없다 — 댕글링 href. 남은 챕터는 접미사만 같다.
      "OPS/c2_subtitle.xhtml": strToU8(makeChapterXhtml("<p>본문.</p>")),
    };
    const epub = zipSync(files);
    expect(() => assertClean(epub)).toThrow(/manifest 항목이 없음/);
  });
});

/**
 * assertClean — 고아 아닌 「라이선스」 제목은 통과시킨다(최종 리뷰 Finding 4).
 *
 * `hasOrphanLicenseHeading`은 예전에 텍스트가 정확히 "라이선스"인 제목이
 * *어디에 있든* 무조건 고아로 봤다 — 제목 뒤에 진짜 산문이 있어도 보지
 * 않았다. 그래서 라이선스 조문을 번역해 놓은 문서처럼, 「라이선스」라는
 * 진짜 제목과 진짜 본문을 가진 정당한 문서를 영영 반입할 수 없었다.
 */
describe("assertClean — 고아 아닌 「라이선스」 제목은 통과시킨다(Finding 4)", () => {
  it("제목 뒤에 실제 산문이 있으면 고아로 보지 않는다", () => {
    // 제목 뒤 산문은 LONG_LICENSE_PROSE를 쓴다 — MIN_BODY_CHARS 문턱을
    // 넘겨야 이 테스트가 검증하려는 "고아 아닌 제목" 판정과 무관한 이유로
    // 실패하지 않는다.
    const epub = makeSingleFileEpub(
      "OPS/c0_license.xhtml",
      makeChapterXhtml(`<h2>라이선스</h2><p>${LONG_LICENSE_PROSE}</p>`),
    );
    expect(() => assertClean(epub)).not.toThrow();
  });
});

describe("readEpubMetadata", () => {
  // 픽스처의 dc:identifier(봄봄)와 dc:source(운수 좋은 날)를 일부러 다르게
  // 둔다 — 둘이 같으면 이 테스트는 어느 태그를 읽었는지 구분하지 못한다.
  it("dc:identifier가 아니라 dc:source를 우선해서 읽는다", () => {
    expect(readEpubMetadata(stripEpub(makeFixture()))).toEqual({
      title: "운수 좋은 날",
      pageTitle: "운수 좋은 날",
    });
  });

  it("dc:source가 빈 태그면 dc:identifier로 대체한다", () => {
    // `??`였다면 .trim()이 준 ""를 nullish로 안 봐서 대체가 안 걸렸다.
    const epub = makeSingleFileEpub(
      "OPS/content.opf",
      `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier>https://ko.wikisource.org/wiki/봄봄</dc:identifier>
<dc:title>봄봄</dc:title>
<dc:source></dc:source>
</metadata>
</package>`,
    );
    expect(readEpubMetadata(epub)).toEqual({ title: "봄봄", pageTitle: "봄봄" });
  });

  it("dc:source가 아예 없으면 dc:identifier로 대체한다", () => {
    const epub = makeSingleFileEpub(
      "OPS/content.opf",
      `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier>https://ko.wikisource.org/wiki/봄봄</dc:identifier>
<dc:title>봄봄</dc:title>
</metadata>
</package>`,
    );
    expect(readEpubMetadata(epub)).toEqual({ title: "봄봄", pageTitle: "봄봄" });
  });

  it("dc:identifier가 urn 같은 위키문헌 주소가 아니면 pageTitle을 null로 둔다(Finding 8)", () => {
    // urn:uuid는 http(s)로 시작하지 않아 toPageTitle에 그대로 넘기면
    // "URL이 아니니 제목"으로 받아 urn 문자열 자체가 source_ref가 될 뻔
    // 했다 — 재수급도, 중복 방지도 안 되는 죽은 값. null이어야 호출자가
    // 관리자 입력값으로 대체한다.
    const epub = makeSingleFileEpub(
      "OPS/content.opf",
      `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier>urn:uuid:8f2c-4a11-b9d0</dc:identifier>
<dc:title>봄봄</dc:title>
</metadata>
</package>`,
    );
    expect(readEpubMetadata(epub)).toEqual({ title: "봄봄", pageTitle: null });
  });
});

describe("assertClean", () => {
  it("정리된 EPUB은 통과하고 챕터 수를 준다", () => {
    expect(assertClean(stripEpub(makeFixture()))).toBe(1);
  });

  it("정리하지 않은 EPUB은 무엇이 남았는지 알려주며 실패한다", () => {
    expect(() => assertClean(makeFixture())).toThrow(/title\.xhtml/);
    expect(() => assertClean(makeFixture())).toThrow(/about\.xhtml/);
    expect(() => assertClean(makeFixture())).toThrow(/라이선스 상자/);
    expect(() => assertClean(makeFixture())).toThrow(/임베드 폰트/);
    expect(() => assertClean(makeFixture())).toThrow(/위키백과 로고/);
  });

  it("챕터 body가 비면 실패한다 — head의 title·style 텍스트에 속지 않는다", () => {
    // path 존재 여부만 보면, 섹션을 통째로 잘못 지워 챕터가 빈 채로
    // 올라가도(Finding 1류 버그) 이 관문을 조용히 통과한다.
    //
    // 픽스처는 실물 ws-export 챕터처럼 <head>에 <title>과 인라인 <style>
    // (CSS 텍스트 포함)을 갖췄다 — <head> 없는 픽스처로는 "파일 전체에서
    // 태그만 걷어내면 title·style 글자가 살아남아 통과해 버리는" 버그가
    // 재현되지 않는다. (이 테스트가 고치기 전 코드에서 실패하는지는 이
    // 파일 밖에서 git stash로 확인했다 — 아래 리포트 참고.)
    const epub = makeSingleFileEpub("OPS/c0_unsu.xhtml", makeChapterXhtml("<p></p>"));
    expect(() => assertClean(epub)).toThrow(/본문 챕터가 전부 비어 있음/);
  });

  it("한 챕터가 삽화뿐인 도판이어도, 다른 챕터에 본문이 있으면 통과한다", () => {
    // 위키문헌 책에는 삽화 한 장만 있는 도판 페이지가 실제로 있다 —
    // 원래부터 본문 텍스트가 없다. 그 한 페이지 때문에 나머지 멀쩡한
    // 챕터까지 게이트에 걸리면 안 된다("하나라도 비면 실패"가 아니라
    // "전부 비어야 실패"인 이유). ch1·ch2 본문은 LONG_PROSE를 반으로 나눠
    // 쓴다 — 도판 챕터(0자)를 더해도 합산 MIN_BODY_CHARS 문턱을 넘겨야
    // 이 테스트가 검증하려는 "도판 챕터 관용"과 무관한 이유로 실패하지
    // 않는다.
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/c0_ch1.xhtml": strToU8(makeChapterXhtml(`<p>${LONG_PROSE_PART1}</p>`)),
      "OPS/c1_plate.xhtml": strToU8(makeChapterXhtml('<img src="images/plate1.png"/>')),
      "OPS/c2_ch2.xhtml": strToU8(makeChapterXhtml(`<p>${LONG_PROSE_PART2}</p>`)),
    };
    const epub = zipSync(files);
    expect(assertClean(epub)).toBe(3);
  });
});

/**
 * assertClean — 고아 「라이선스」 제목(실물 입력에서 발견).
 *
 * stripLicenseBlocks가 상자만 지우고 섹션을 못 지운 채로 남기면(전제부
 * 판정이 구조 검사였을 때 실제로 벌어졌던 일) 챕터 끝에 <h2>라이선스</h2>
 * 제목만 고아로 남는다. assertClean은 지금까지 `licenseContainer` 문자열만
 * 찾았으므로 상자가 없어진 이 잔재는 못 잡고 조용히 통과시켰다 — 그래서
 * 「라이선스」 텍스트를 가진 제목을 직접 찾는 검사를 추가한다.
 */
describe("assertClean — 고아 「라이선스」 제목", () => {
  it("상자는 지워졌지만 「라이선스」 제목만 남은 챕터는 실패한다", () => {
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      makeChapterXhtml(
        `<section data-mw-section-id="1"><h2 id="laiseonseu"><span id="id-x" typeof="mw:FallbackId"/>라이선스</h2>
<span class="mw-empty-elt" about="#mwt6" typeof="mw:Transclusion"/></section>`,
      ),
    );
    expect(() => assertClean(epub)).toThrow(/고아 라이선스 제목/);
  });
});

/**
 * assertClean — 패키지 무결성(Finding 3).
 *
 * 지금까지의 검사는 전부 "뭔가 없어졌는가"만 봤다. 여기 세 픽스처는 "파일은
 * 있는데 manifest/spine이 더는 그 파일을 가리키지 않는" 세 가지 실제
 * 모양을 직접 조립한다 — stripEpub을 거치지 않고 assertClean에 바로
 * 먹인다. 이유는 픽스처 1(디렉터리 항목)이 정확히 그 대상이기 때문이다:
 * stripEpub의 가드가 고쳐지면 그 버그는 더는 재현되지 않으므로, "고장 난
 * 산출물이 실수로 다시 나타나면 잡아야 한다"는 이 검사 자체를 시험하려면
 * 그 고장 난 산출물의 모양을 직접 만들어야 한다.
 *
 * 세 픽스처 다 고치기 전 코드(이 describe 블록을 추가하기 전의
 * assertClean — package-integrity 검사가 없는 버전)에서는 통과했다는 걸
 * `git stash`로 wikisource.ts만 원본으로 되돌리고 확인했다 — 아래 최종
 * 리포트에 그 증거를 남긴다.
 */
describe("assertClean — 패키지 무결성", () => {
  it("디렉터리 항목이 manifest·spine·목차를 통째로 비워도 잡는다(Finding 2)", () => {
    // Finding 2가 실제로 만드는 산출물의 모양 — zip에 "OPS/fonts/" 같은
    // 디렉터리 항목이 섞이면 droppedHref가 모든 href에 걸려 manifest·spine·
    // nav·toc가 전부 빈 채로 남는다. 챕터 파일 자체는 본문 글자를 갖고
    // 살아남으므로, "파일 존재"·"본문 공백" 검사는 전부 통과한다.
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/content.opf": strToU8(
        `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>테스트</dc:title></metadata>
<manifest></manifest>
<spine></spine>
</package>`,
      ),
      "OPS/nav.xhtml": strToU8(`<html><body><nav><ol></ol></nav></body></html>`),
      "OPS/toc.ncx": strToU8(`<ncx><navMap></navMap></ncx>`),
      "OPS/c0_test.xhtml": strToU8(
        makeChapterXhtml("<p>새침하게 흐린 품이 눈이 올 듯하더니</p>"),
      ),
    };
    const epub = zipSync(files);
    expect(() => assertClean(epub)).toThrow(/manifest 항목이 없음/);
  });

  it("챕터 파일명이 걷어낼 파일과 접미사가 겹쳐 manifest·spine에서만 빠져도 잡는다", () => {
    // "OPS/c2_subtitle.xhtml"의 basename은 "title.xhtml"로 끝난다 —
    // droppedHref가 이걸 표지 파일로 오인해 manifest 항목과 spine
    // itemref만 지운다(파일 자체는 안 지워진다). 결과: 파일은 있는데 아무
    // 진입점도 그 파일을 가리키지 않는, 뷰어가 닿을 수 없는 챕터.
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/content.opf": strToU8(
        `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>테스트</dc:title></metadata>
<manifest>
<item id="c1" href="c1_ch1.xhtml" media-type="application/xhtml+xml" />
</manifest>
<spine>
<itemref idref="c1" />
</spine>
</package>`,
      ),
      "OPS/c1_ch1.xhtml": strToU8(makeChapterXhtml("<p>첫 번째 챕터.</p>")),
      // 이 챕터를 가리키는 manifest 항목·spine itemref가 없다 — 접미사
      // 충돌로 걷어내는 쪽 규칙에 걸려 지워진 것처럼.
      "OPS/c2_subtitle.xhtml": strToU8(makeChapterXhtml("<p>두 번째 챕터.</p>")),
    };
    const epub = zipSync(files);
    expect(() => assertClean(epub)).toThrow(/manifest 항목이 없음/);
  });

  it("non-self-closing <item>이 지운 파일을 계속 가리켜도 잡는다", () => {
    // stripEpub의 item 제거 정규식은 self-closing(`<item … />`)만 잡는다.
    // `<item id="f1" href="fonts/…"></item>`처럼 닫는 태그가 따로 있으면
    // 그 항목은 살아남는데, href가 가리키던 파일(fonts/…)은 이미 지워지고
    // 없다 — manifest이 없는 파일을 가리키는 상태.
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/content.opf": strToU8(
        `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>테스트</dc:title></metadata>
<manifest>
<item id="c1" href="c1_ch1.xhtml" media-type="application/xhtml+xml" />
<item id="f1" href="fonts/FreeSerif.ttf" media-type="application/font-sfnt"></item>
</manifest>
<spine>
<itemref idref="c1" />
</spine>
</package>`,
      ),
      "OPS/c1_ch1.xhtml": strToU8(makeChapterXhtml("<p>첫 번째 챕터.</p>")),
      // fonts/FreeSerif.ttf 파일 자체는 이미 없다 — item만 살아남았다.
    };
    const epub = zipSync(files);
    expect(() => assertClean(epub)).toThrow(/존재하지 않는 파일을 가리킴/);
  });
});

/**
 * assertClean — MIN_BODY_CHARS(빈 껍데기 게이트, master 이식).
 *
 * ws-export는 문서에 본문이 멀쩡히 있어도 제목만 든 빈 껍데기를 내주는
 * 때가 있다 — 「감자」(원문 6,516자)가 본문 2자짜리 EPUB으로 나왔고,
 * 「백치 아다다」·「자유종」도 같았다. HTTP 200, 유효한 EPUB, 챕터 파일도
 * 하나 있어서 글자수를 세지 않으면 빈 책이 그대로 등록된다.
 *
 * 이 branch의 기존 "챕터가 전부 비어 있음" 검사(`chapterBodyText` 기반)는
 * 이 사각지대를 못 잡는다 — 2자는 공백이 아닌 엄연한 글자라서 그 검사를
 * 통과해 버린다. 포팅 전 코드로 그걸 직접 확인했다: 이 describe의 첫
 * 테스트를 `git stash`로 wikisource.ts만 되돌리고 돌려 보면 통과(assertClean이
 * 던지지 않음)한다 — 아래 최종 리포트에 그 증거를 남긴다.
 */
describe("assertClean — MIN_BODY_CHARS(빈 껍데기 게이트)", () => {
  it("챕터 본문이 몇 글자뿐이면 실패하고, 메시지에 글자수를 남겨 빈 껍데기와 마크업 파괴를 구분하게 한다", () => {
    // 실측 그대로: 「감자」가 ws-export에서 본문 2자짜리 EPUB으로 돌아온
    // 사례를 재현한다. chapterBodyText 기준으로는 "전부 비어 있음"이
    // 아니므로(2자는 0자가 아니다) 그 검사는 통과하고, 이 검사만 잡는다.
    // countBodyChars는 master처럼 파일 전체(제목 포함)에서 글자수를 세므로,
    // makeChapterXhtml이 넣는 챕터 제목 "운수 좋은 날"(5자) + 본문 "감자"
    // (2자) = 7자가 잡힌다 — 그래도 500자에는 한참 못 미친다.
    const epub = makeSingleFileEpub("OPS/c0_gamja.xhtml", makeChapterXhtml("<p>감자</p>"));
    expect(() => assertClean(epub)).toThrow(/본문이 너무 짧음 \(7자, 최소 500자\)/);
  });

  it("챕터 본문이 문턱을 넉넉히 넘으면 통과한다", () => {
    // LONG_PROSE는 500자보다 훨씬 길다(약 589자, 공백 제외) — 문턱을
    // 근소하게가 아니라 넉넉하게 넘는 실감 본문이다.
    expect(LONG_PROSE.replace(/\s+/g, "").length).toBeGreaterThan(MIN_BODY_CHARS);
    const epub = makeSingleFileEpub(
      "OPS/c0_unsu.xhtml",
      makeChapterXhtml(`<p>${LONG_PROSE}</p>`),
    );
    expect(assertClean(epub)).toBe(1);
  });
});

/**
 * stripEpub — 안내문(hatnote) 제거(master 이식).
 *
 * 위키문헌은 동음이의 안내를 본문 맨 앞에 붙인다 — 「탈출기」는 "성경의
 * 책에 대해서는 출애굽기 문서를 참조하십시오."로 시작한다. 독자가 펼친
 * 첫 문장이 남의 사이트 내비게이션일 수는 없다.
 *
 * 포팅 전 코드(`stripHatnotes` 호출이 없던 `stripEpub`)로 첫 테스트를
 * 돌리면 hatnote div가 그대로 남아 실패한다 — 아래 최종 리포트에 그
 * 증거를 남겼다.
 */
describe("stripEpub — 안내문(hatnote) 제거", () => {
  it("안내문으로 시작하는 챕터는 안내문만 지우고 뒤따르는 본문은 남긴다", () => {
    const chapter = makeChapterXhtml(
      `<div class="hatnote">성경의 책에 대해서는 출애굽기 문서를 참조하십시오.</div>
<p>${LONG_PROSE}</p>`,
    );
    const epub = makeSingleFileEpub("OPS/c0_talchulgi.xhtml", chapter);
    const out = read(stripEpub(epub)).text("OPS/c0_talchulgi.xhtml");

    expect(out).not.toMatch(/hatnote/);
    expect(out).not.toMatch(/출애굽기/);
    // 안내문 뒤 본문은 처음과 끝 모두 살아 있어야 한다.
    expect(out).toMatch(/새침하게 흐린 품이/);
    expect(out).toMatch(/마음이 놓였다/);
  });

  it("안내문이 없는 챕터는 본문을 그대로 둔다", () => {
    const chapter = makeChapterXhtml(`<p>${LONG_PROSE}</p>`);
    const epub = makeSingleFileEpub("OPS/c0_unsu.xhtml", chapter);
    const out = read(stripEpub(epub)).text("OPS/c0_unsu.xhtml");

    expect(out).toMatch(/새침하게 흐린 품이/);
    expect(out).toMatch(/마음이 놓였다/);
  });
});
