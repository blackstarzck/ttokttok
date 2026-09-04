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
<dc:identifier id="uid">https://ko.wikisource.org/wiki/%EC%9A%B4%EC%88%98_%EC%A2%8B%EC%9D%80_%EB%82%A0</dc:identifier>
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
  it("dc:title과 dc:source에서 제목·문서 제목을 읽는다", () => {
    expect(readEpubMetadata(stripEpub(makeFixture()))).toEqual({
      title: "운수 좋은 날",
      pageTitle: "운수 좋은 날",
    });
  });
});

describe("assertClean", () => {
  it("정리된 EPUB은 통과하고 챕터 수를 준다", () => {
    expect(assertClean(stripEpub(makeFixture()))).toBe(1);
  });

  it("정리하지 않은 EPUB은 무엇이 남았는지 알려주며 실패한다", () => {
    expect(() => assertClean(makeFixture())).toThrow(/title\.xhtml/);
    expect(() => assertClean(makeFixture())).toThrow(/라이선스 상자/);
    expect(() => assertClean(makeFixture())).toThrow(/임베드 폰트/);
  });
});
