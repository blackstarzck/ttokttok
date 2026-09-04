import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  assertClean,
  readEpubMetadata,
  stripEpub,
  toPageTitle,
} from "@/lib/wikisource";

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
    // 상자 자체가 div로 여러 겹 중첩돼 있다.
    "OPS/c0_unsu.xhtml": strToU8(
      `<html><body>
<section data-mw-section-id="0"><p>새침하게 흐린 품이 눈이 올 듯하더니</p></section>
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
    // "전부 비어야 실패"인 이유).
    const files: Zippable = {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "OPS/c0_ch1.xhtml": strToU8(
        makeChapterXhtml("<p>새침하게 흐린 품이 눈이 올 듯하더니</p>"),
      ),
      "OPS/c1_plate.xhtml": strToU8(makeChapterXhtml('<img src="images/plate1.png"/>')),
      "OPS/c2_ch2.xhtml": strToU8(
        makeChapterXhtml("<p>이 날이야말로 동소문 안에서 얼음 지치는 아이들</p>"),
      ),
    };
    const epub = zipSync(files);
    expect(assertClean(epub)).toBe(3);
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
