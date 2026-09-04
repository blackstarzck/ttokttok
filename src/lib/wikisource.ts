/**
 * 한국 위키문헌 → EPUB 수급 (PRD §5.11).
 *
 * ws-export(`ws-export.wmcloud.org`)가 위키문헌 페이지를 EPUB으로 만들어 준다.
 * 하위 페이지(장별 분할)와 ProofreadPage 트랜스클루전(PDF 스캔 교정본)도
 * 알아서 따라가므로, 목차 페이지 하나만 지정하면 된다.
 *
 * 다만 ws-export는 두 가지를 얹어서 준다.
 *
 * ① FreeSerif 4종(약 7.7MB)을 항상 임베드하고 끄는 옵션이 없다. 본문이
 *    34KB인 단편도 4.3MB가 되어 모바일에서 첫 페이지까지 한참 걸린다 —
 *    우리는 epub.js에 자체 CSS를 물리므로 이 폰트는 쓰이지도 않는다.
 * ② 위키문헌 자신의 껍데기: 로고가 박힌 표지 페이지, 기여자 목록이 담긴
 *    "About this digital edition", 본문 끝의 「라이선스」 안내 상자.
 *    우리 판본의 첫 화면이 남의 로고일 수는 없다.
 *
 * 그래서 받아온 뒤 둘을 함께 걷어낸다 (`stripEpub`). 다만 content.opf의
 * dc:rights(CC BY-SA 3.0 / GFDL)·dc:contributor 메타데이터는 **남긴다** —
 * 화면에 안 보이는 출처 기록이고, 지우는 건 권리 표시를 떼는 별개의
 * 판단이다. 수급 출처는 books.source·source_ref·rights_note에도 적힌다.
 *
 * 이 모듈은 앱(어드민 임포트)과 스크립트(seed·refresh-epubs)가 함께 쓰는
 * 유일한 원천이다. 그래서 두 가지 규약을 지킨다.
 *   - `import "server-only"`를 붙이지 않는다 — 붙이면 plain node로 도는
 *     스크립트가 실행 즉시 throw한다.
 *   - `Buffer`를 쓰지 않고 `Uint8Array`를 주고받는다 — 런타임 중립.
 */

import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  type Zippable,
} from "fflate";

const WS_EXPORT = "https://ws-export.wmcloud.org/";
const USER_AGENT = "ttokttok/0.1 (https://github.com/ttokttok; content sourcing)";

/** EPUB 스펙: mimetype은 첫 항목이어야 하고 압축하면 안 된다. */
const MIMETYPE = "mimetype";

/** 받아들이는 위키문헌 호스트 — 한국어판과 그 모바일 도메인만. */
const KO_WIKISOURCE_HOST = /^ko\.(m\.)?wikisource\.org$/i;

/**
 * 입력을 위키문헌 문서 제목으로 정규화한다.
 *
 * 관리자는 브라우저에서 문서를 찾아놓고 오므로 주소를 붙여넣는 게 자연스럽고,
 * 제목을 직접 타이핑하는 경우도 받는다. 결과 형식은 `books.source_ref`에
 * 그대로 저장되며 ws-export의 입력으로도 쓰인다 — 임포트·시드·재수급이
 * 전부 이 함수를 거쳐야 unique 인덱스가 중복을 잡는다.
 */
export function toPageTitle(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("위키문헌 문서 주소나 제목을 입력해 주세요.");
  }

  if (!/^https?:\/\//i.test(raw)) {
    return normalizeTitle(raw);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`주소를 읽을 수 없습니다: ${raw}`);
  }

  if (!KO_WIKISOURCE_HOST.test(url.hostname)) {
    throw new Error(
      `한국 위키문헌(ko.wikisource.org) 주소만 가져올 수 있습니다 — 받은 주소: ${url.hostname}`,
    );
  }

  const fromQuery = url.searchParams.get("title");
  if (fromQuery) return normalizeTitle(fromQuery);

  const WIKI = "/wiki/";
  if (!url.pathname.startsWith(WIKI)) {
    throw new Error(
      "문서 주소가 아닙니다 — ko.wikisource.org/wiki/문서제목 형태여야 합니다.",
    );
  }
  return normalizeTitle(url.pathname.slice(WIKI.length));
}

function normalizeTitle(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 이미 디코드된 값에 `%`가 섞여 있으면 decodeURIComponent가 던진다.
    // 그 경우 원문을 그대로 쓴다 — 제목에 %가 들어간 문서가 있을 수 있다.
  }

  const title = decoded.replace(/_/g, " ").trim();
  if (!title) throw new Error("문서 제목이 비어 있습니다.");
  return title;
}

/**
 * 위키문헌 페이지를 EPUB으로 받아 폰트·껍데기를 걷어낸 바이트를 돌려준다.
 * @param pageTitle `toPageTitle`을 거친 문서 제목 (예: "운수 좋은 날")
 */
export async function fetchEpub(pageTitle: string): Promise<Uint8Array> {
  const url = `${WS_EXPORT}?format=epub&lang=ko&page=${encodeURIComponent(pageTitle)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    console.error(`ws-export HTTP ${res.status} — ${url}`);
    throw new Error(
      `위키문헌에서 「${pageTitle}」을 받지 못했습니다 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!/epub/i.test(contentType)) {
    // ws-export는 문서를 못 찾으면 영문 HTML을 준다. 그 원문을 관리자
    // 화면에 그대로 띄우면 읽고 할 수 있는 일이 없다 — 로그로만 남긴다.
    const body = (await res.text()).slice(0, 500).replace(/\s+/g, " ");
    console.error(`ws-export가 EPUB이 아닌 응답을 줬다 (${pageTitle}): ${body}`);
    throw new Error(
      `위키문헌에서 「${pageTitle}」 문서를 찾지 못했습니다. 주소를 확인해 주세요.`,
    );
  }

  return stripEpub(new Uint8Array(await res.arrayBuffer()));
}

/** 위키문헌 껍데기 파일 — 우리 판본에 실리면 안 되는 것들. */
const CHROME_FILES = [/(^|\/)title\.xhtml$/i, /(^|\/)about\.xhtml$/i];

/**
 * 위키문헌·위키백과 로고와 라이선스 상자의 아이콘(PD 마크·경고 삼각형).
 * 위키백과 로고는 "정보" 페이지에서만 참조되므로, 그 페이지를 지우면
 * 참조 없는 고아 파일로 남는다 — 함께 걷어낸다.
 */
const CHROME_IMAGES = [
  /Wikisource-logo/i,
  /Wikipedia_logo/i,
  /PD_icon/i,
  /ructive_black_darkred/i,
];

/** 라이선스 상자를 여는 태그 — 클래스로만 식별된다(태그 종류는 책마다 다르다). */
const LICENSE_OPEN = /<(section|div)\b[^>]*class="[^"]*licenseContainer[^"]*"[^>]*>/i;

/**
 * `<tag …>`로 시작하는 지점부터 짝이 맞는 닫는 태그 바로 뒤 인덱스를
 * 돌려준다. 라이선스 상자는 div가 여러 겹 중첩돼 있어 단순 비탐욕
 * 정규식으로는 중간에서 끊긴다 — 깊이를 세야 짝을 제대로 찾는다.
 * 짝이 없으면 null.
 */
function findBlockEnd(html: string, tag: string, startIndex: number): number | null {
  const open = new RegExp(`<${tag}\\b`, "gi");
  const close = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 0;
  let i = startIndex;

  while (i < html.length) {
    open.lastIndex = i;
    close.lastIndex = i;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return null; // 짝이 없다

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + 1;
      continue;
    }
    depth--;
    if (depth === 0) return nextClose.index + nextClose[0].length;
    i = nextClose.index + 1;
  }
  return null;
}

/** `<tag …>`로 시작하는 지점부터 짝이 맞는 닫는 태그까지의 구간을 지운다. */
function removeBlockAt(html: string, tag: string, startIndex: number): string {
  const end = findBlockEnd(html, tag, startIndex);
  if (end === null) return html; // 짝이 없다 — 건드리지 않는다
  return html.slice(0, startIndex) + html.slice(end);
}

/** 라이선스 상자 앞에 이 정도(제목 하나, 또는 아무 것도 없음)만 있으면 그 섹션은 라이선스 전용으로 본다. */
const SECTION_PREFACE_ONLY_HEADING = /^\s*(<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>\s*)?$/i;

/**
 * 라이선스 상자를 지울 때 섹션째 지울지, 상자만 지울지 고른다.
 *
 * "상자 앞에 가장 가까운 <section>"을 무조건 섹션째 지우면 두 가지가
 * 잘못된다.
 *   ① 그 섹션이 이미 닫힌 뒤에 상자가 나오는 판본(섹션 없이 div만 붙는
 *      경우) — 상자와 무관한, 이미 끝난 본문 섹션이 통째로 날아간다.
 *   ② 상자가 본문과 같은 섹션에 들어 있는 판본 — 섹션째 지우면 본문까지
 *      함께 사라진다.
 * 그래서 후보 섹션이 상자를 실제로 감싸는지(닫는 태그가 상자 시작보다
 * 뒤인지)부터 확인하고, 감싸더라도 상자 앞에 「라이선스」류 제목 말고 다른
 * 내용이 있으면 상자만 지운다 — ws-export가 만드는 진짜 라이선스 섹션은
 * 제목 하나만 앞에 두기 때문이다.
 */
function findLicenseTarget(
  html: string,
  hit: RegExpExecArray,
): { tag: string; start: number } {
  const sectionOpen = /<section\b[^>]*>/gi;
  let candidate: RegExpExecArray | null = null;
  for (let m; (m = sectionOpen.exec(html)) !== null && m.index < hit.index; ) {
    candidate = m;
  }

  if (candidate) {
    const sectionEnd = findBlockEnd(html, "section", candidate.index);
    const encloses = sectionEnd !== null && sectionEnd > hit.index;
    const preface = html.slice(candidate.index + candidate[0].length, hit.index);
    if (encloses && SECTION_PREFACE_ONLY_HEADING.test(preface)) {
      return { tag: "section", start: candidate.index };
    }
  }

  return { tag: hit[1], start: hit.index };
}

/**
 * 본문에서 「라이선스」 상자를 걷어낸다.
 *
 * ws-export는 상자를 `<section data-mw-section-id="…">`으로 감싸고 그 안에
 * 「라이선스」 제목까지 넣는다. 상자만 지우면 제목이 남으므로, 상자를 품은
 * 섹션을 통째로 지운다. 다만 섹션 없이 div만 붙는 판본도 있고, 상자가 본문과
 * 같은 섹션에 얹히는 판본도 있다 — 두 경우 다 섹션째 지우면 본문이 함께
 * 날아가므로, 어느 쪽인지는 `findLicenseTarget`이 가른다.
 *
 * `<head>`의 CSS에도 `.licenseContainer{…}` 규칙이 들어 있는데, 이건 본문이
 * 아니라 스타일이라 마지막에 따로 지운다 — 먼저 문자열을 찾으면 CSS가
 * 걸려서 정작 본문 상자를 못 찾는다.
 */
function stripLicenseBlocks(html: string): string {
  let out = html;

  for (;;) {
    const hit = LICENSE_OPEN.exec(out);
    if (!hit) break;

    const target = findLicenseTarget(out, hit);
    const next = removeBlockAt(out, target.tag, target.start);
    if (next === out) break; // 못 지웠다 — 무한루프 방지
    out = next;
  }

  // 남은 CSS 규칙(선택자에 license가 들어간 것)도 함께 정리한다.
  return out.replace(/[^{}]*license[^{}]*\{[^}]*\}/gi, "");
}

/**
 * 임베드 폰트와 위키문헌 껍데기를 **한 번의 압축 왕복으로** 걷어낸다.
 *
 * 원래는 폰트 제거와 껍데기 제거가 별개 함수였고 각각 4.4MB를 통째로
 * unzip → zipSync 했다. 스크립트에서만 돌 때는 문제가 아니었지만 이제
 * 서버리스 함수 안에서 돌므로 그 왕복을 한 번으로 합쳤다.
 *
 * 파일만 지우면 안 된다 — content.opf의 manifest·spine, nav.xhtml, toc.ncx에
 * 남은 참조를 함께 끊어야 뷰어가 없는 파일을 찾지 않는다. main.css의
 * @font-face 선언도 같이 지운다.
 */
export function stripEpub(epub: Uint8Array): Uint8Array {
  const entries = unzipSync(epub);
  const dropped: string[] = [];
  const out: Record<string, Uint8Array> = {};

  for (const [path, data] of Object.entries(entries)) {
    const isFont = /(^|\/)fonts\//i.test(path);
    const isChromeFile = CHROME_FILES.some((re) => re.test(path));
    const isChromeImage =
      /(^|\/)images\//i.test(path) && CHROME_IMAGES.some((re) => re.test(path));

    if (isFont || isChromeFile || isChromeImage) {
      dropped.push(path.replace(/^.*\//, ""));
      continue;
    }
    out[path] = data;
  }

  const droppedHref = (href: string) =>
    dropped.some((name) => href.endsWith(name) || href.endsWith(encodeURI(name)));

  for (const [path, data] of Object.entries(out)) {
    if (/\.opf$/i.test(path)) {
      let opf = strFromU8(data);

      // 지운 파일의 manifest 항목과, 그 id를 가리키는 spine 항목을 함께 뺀다.
      const removedIds: string[] = [];
      opf = opf.replace(/<item\b[^>]*\/>\s*/gi, (item) => {
        const href = /href="([^"]*)"/i.exec(item)?.[1] ?? "";
        if (!droppedHref(href)) return item;
        const id = /id="([^"]*)"/i.exec(item)?.[1];
        if (id) removedIds.push(id);
        return "";
      });

      for (const id of removedIds) {
        opf = opf.replace(
          new RegExp(`<itemref\\b[^>]*idref="${id}"[^>]*/>\\s*`, "gi"),
          "",
        );
      }
      out[path] = strToU8(opf);
    } else if (/(^|\/)nav\.xhtml$/i.test(path)) {
      // 목차에서 표지·정보 항목을 뺀다 (뷰어 목차 시트에 그대로 노출된다).
      const nav = strFromU8(data).replace(
        /<li\b[^>]*>\s*<a\b[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>\s*<\/li>\s*/gi,
        (li, href: string) => (droppedHref(href) ? "" : li),
      );
      out[path] = strToU8(nav);
    } else if (/(^|\/)toc\.ncx$/i.test(path)) {
      const ncx = strFromU8(data).replace(
        /<navPoint\b[\s\S]*?<\/navPoint>\s*/gi,
        (point) => {
          const href = /src="([^"]*)"/i.exec(point)?.[1] ?? "";
          return droppedHref(href) ? "" : point;
        },
      );
      out[path] = strToU8(ncx);
    } else if (/\.xhtml$/i.test(path)) {
      out[path] = strToU8(stripLicenseBlocks(strFromU8(data)));
    } else if (/\.css$/i.test(path)) {
      // stripLicenseBlocks는 여기 쓰지 않는다 — 그 함수의 CSS 정리 정규식은
      // 직전 `}`에만 걸려 있어서, "released under a free license" 같은 주석
      // 한 줄 때문에 그 다음 규칙(body 등)까지 통째로 삼킬 수 있다. 죽은
      // `.licenseContainer{…}` 규칙 하나 남는 건 감수하고, 본문(.xhtml)에
      // 인라인된 <style>에만 적용한다.
      const css = strFromU8(data).replace(/@font-face\s*\{[^}]*\}\s*/gi, "");
      out[path] = strToU8(css);
    }
  }

  // mimetype을 무압축으로 먼저 넣는다 (EPUB 스펙).
  const ordered: Zippable = {};
  if (out[MIMETYPE]) ordered[MIMETYPE] = [out[MIMETYPE], { level: 0 }];
  for (const [path, data] of Object.entries(out)) {
    if (path === MIMETYPE) continue;
    ordered[path] = data;
  }

  return zipSync(ordered, { level: 6 });
}

/**
 * EPUB에서 제목과 원본 문서 제목을 읽는다.
 *
 * ws-export는 `dc:title`과 `dc:source`(위키문헌 문서 URL)를 넣는다.
 * **`dc:creator`는 넣지 않는다** — 확인된 사실이고, 그래서 저자는 관리자가
 * 직접 입력한다 (결정 기록 §11-48).
 *
 * `dc:source`를 쓰는 이유: 위키문헌이 리다이렉트·표기를 정규화해 준
 * 최종 문서 주소라서, 관리자가 입력한 값보다 신뢰할 수 있다.
 */
export function readEpubMetadata(epub: Uint8Array): {
  title: string | null;
  pageTitle: string | null;
} {
  const entries = unzipSync(epub);
  const opfPath = Object.keys(entries).find((p) => /\.opf$/i.test(p));
  if (!opfPath) return { title: null, pageTitle: null };

  const opf = strFromU8(entries[opfPath]);
  const title = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1]?.trim();
  // `??`가 아니라 falsy 체크를 쓴다 — `<dc:source></dc:source>`처럼 빈
  // 태그가 실려 오면 .trim()이 ""를 주는데, ??는 ""를 nullish로 안 봐서
  // 대체가 안 걸린다. 빈 문자열도 "값이 없다"로 취급해야 한다.
  const source =
    /<dc:source\b[^>]*>([\s\S]*?)<\/dc:source>/i.exec(opf)?.[1]?.trim() ||
    /<dc:identifier\b[^>]*>([\s\S]*?)<\/dc:identifier>/i.exec(opf)?.[1]?.trim();

  let pageTitle: string | null = null;
  if (source) {
    try {
      pageTitle = toPageTitle(source);
    } catch {
      // dc:source가 위키문헌 주소가 아니면 무시한다 — 호출자가 관리자
      // 입력값으로 대체한다.
      pageTitle = null;
    }
  }

  return { title: title || null, pageTitle };
}

/**
 * 업로드 직전 관문 — 수급 파이프라인이 제 일을 했는지 확인한다.
 *
 * 껍데기가 남은 파일이 조용히 올라가면 뷰어를 열어 보기 전까지 아무도
 * 모른다. 정규식으로 XML을 주무르는 처리라 위키문헌이 마크업을 바꾸면
 * 언제든 헛돌 수 있다.
 *
 * @returns 본문 챕터 수
 */
export function assertClean(epub: Uint8Array): number {
  const entries = unzipSync(epub);
  const paths = Object.keys(entries);
  const body = paths
    .filter((p) => /\.xhtml$/i.test(p))
    .map((p) => strFromU8(entries[p]))
    .join("");

  const problems: string[] = [];
  if (paths[0] !== MIMETYPE) problems.push("mimetype이 첫 항목이 아님");
  if (paths.some((p) => /(^|\/)title\.xhtml$/i.test(p))) problems.push("title.xhtml");
  if (paths.some((p) => /(^|\/)about\.xhtml$/i.test(p))) problems.push("about.xhtml");
  if (paths.some((p) => /Wikisource-logo/i.test(p))) problems.push("위키문헌 로고");
  if (paths.some((p) => /Wikipedia_logo/i.test(p))) problems.push("위키백과 로고");
  if (paths.some((p) => /(^|\/)fonts\//i.test(p))) problems.push("임베드 폰트");
  if (/licenseContainer/i.test(body)) problems.push("라이선스 상자");

  const chapterPaths = paths.filter((p) => /\/c\d+_.*\.xhtml$/i.test(p));
  if (chapterPaths.length === 0) {
    problems.push("본문 챕터 없음");
  } else if (
    // 챕터 파일은 있지만 태그만 남고 글자가 하나도 없는 경우 — 섹션을
    // 통째로 잘못 지웠을 때(Finding 1류 버그) 나는 증상이라, 경로 존재
    // 여부만 보는 지금까지의 검사로는 못 잡는다.
    chapterPaths.some(
      (p) => strFromU8(entries[p]).replace(/<[^>]*>/g, "").trim().length === 0,
    )
  ) {
    problems.push("본문 챕터가 비어 있음");
  }

  if (problems.length > 0) {
    throw new Error(
      `받아온 EPUB 정리에 실패했습니다 — ${problems.join(", ")}. ` +
        `위키문헌의 문서 구조가 바뀌었을 수 있습니다 (src/lib/wikisource.ts).`,
    );
  }
  return chapterPaths.length;
}
