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

/**
 * 조각 HTML에서 태그를 걷어내고 순수 텍스트만 남긴다(공백 정규화 포함).
 *
 * 태그 자리를 그냥 지우지 않고 공백으로 바꾼다 — 그렇지 않으면
 * `<h2>제목</h2><p>내용</p>`처럼 인접한 요소의 글자가 "제목내용"으로 붙어
 * 버려서, 실제로는 서로 다른 글 뭉치인데 우연히 다른 문자열과 같아지거나
 * 반대로 실제 산문이 섞였는데도 "글자가 없다"는 식으로 오판할 여지가
 * 생긴다. 상자·제목처럼 서로 다른 태그가 바로 붙어 나오는 실물 ws-export
 * 마크업에서 이 경계가 실제로 문제가 된다.
 */
function extractText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 전제부(preface)에서 제목 하나를 찾는다 — 없으면 null. */
const HEADING = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i;

/**
 * 라이선스 상자 앞(preface)이 "제목뿐"인지 글자로 판정한다.
 *
 * 예전에는 이걸 *태그 구조*로 봤다 — "제목 태그 하나, 또는 아무 것도
 * 없음"이면 제목뿐이라고 판단했다. 그런데 실물 ws-export 출력은 제목 뒤에
 * 글자가 전혀 없는 MediaWiki 트랜스클루전 마커
 * (`<span class="mw-empty-elt" .../>`)를 붙인다 — 태그 하나가 늘었을
 * 뿐인데 그 구조 검사는 "제목 말고 다른 내용이 있다"고 오판해 섹션째
 * 지우기를 포기했고, 그 결과 상자만 지워지고 「라이선스」 제목이 챕터
 * 끝에 고아로 남았다(실물 「운수 좋은 날」 EPUB에서 확인).
 *
 * 그래서 태그를 걷어낸 *글자*를 비교한다 — 전제부에 남는 글자가 없거나
 * (빈 마커뿐), 제목 자신의 글자와 똑같으면 "제목뿐"으로 본다. 태그가
 * 몇 개 붙든 글자가 없으면 통과하므로 이런 마커에 흔들리지 않는다.
 * 반대로 실제 산문이 하나라도 섞이면 글자 비교가 달라지므로 여전히
 * 상자만 지운다 — 예전에 본문을 지웠던 버그의 재발 방지 가드는 그대로
 * 유지된다. 앞으로 이 판정을 다시 태그 구조로 되돌리지 말 것 — 위키문헌은
 * 태그를 늘리기만 해도 글자 없는 마커를 아무 데나 끼워 넣을 수 있다.
 */
function isLicenseOnlyPreface(preface: string): boolean {
  const prefaceText = extractText(preface);
  if (prefaceText === "") return true;

  const heading = HEADING.exec(preface);
  const headingText = heading ? extractText(heading[0]) : "";
  return headingText !== "" && prefaceText === headingText;
}

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
 * 뒤인지)부터 확인하고, 감싸더라도 상자 앞에 실제 내용(제목 말고 다른
 * 글자)이 있으면 상자만 지운다 — 이 판정은 `isLicenseOnlyPreface`가 글자로
 * 한다(왜 태그 구조가 아니라 글자인지는 그 함수 주석 참고).
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
    if (encloses && isLicenseOnlyPreface(preface)) {
      return { tag: "section", start: candidate.index };
    }
  }

  return { tag: hit[1], start: hit.index };
}

/**
 * `<style>` 원소를 여는 태그·CDATA 시작 마커·본문(CSS 텍스트)·CDATA 끝
 * 마커·닫는 태그, 다섯 조각으로 따로 붙잡는다.
 *
 * 예전에는 `<style\b[^>]*>[\s\S]*?<\/style>`로 통째로 하나의 매치를 얻은
 * 뒤, 그 매치 문자열 *전체*(태그·CDATA 마커 포함)에 대고 "license가 낀
 * 규칙"을 정규식으로 다시 찾았다. 그러면 여는 태그와 CDATA 시작 마커까지도
 * "중괄호 아닌 글자"로 보여서 그 두 번째 정규식의 탐색 범위 안에 들어간다
 * — 실물 「운수 좋은 날」 EPUB에서 정확히 이 일이 벌어졌다:
 * `<style typeof="…"><![CDATA[.mw-parser-output .licenseContainer{…}`에서
 * "license"를 찾은 두 번째 정규식이 그 앞의 여는 태그·CDATA 시작 마커까지
 * 통째로 삼켜서, 결과물엔 `]]></style>`만 짝 없이 남았다(EPUB은 XML로
 * 파싱되므로 이건 파싱 실패거나, 관대한 리더에서는 `]]>`가 화면에 그대로
 * 찍히는 사고다). 그래서 본문(CSS 텍스트)만 따로 뽑아 거기에만 정리
 * 정규식을 적용하고, 태그·마커는 조립할 때 손대지 않고 그대로 되돌려
 * 붙인다 — 정리 정규식이 아무리 욕심을 부려도 이 델리미터들 바깥으로는
 * 나갈 수 없다.
 */
const STYLE_ELEMENT =
  /(<style\b[^>]*>)(<!\[CDATA\[)?([\s\S]*?)(\]\]>)?(<\/style>)/gi;

/**
 * CSS 본문 안에서 "선택자 토큰에 license가 들어간 규칙" 하나를 지운다.
 *
 * 두 가지를 예전 정규식(`[^{}]*license[^{}]*\{[^}]*\}`)에서 좁혔다.
 *
 * ① 문자 집합에서 `<`, `>`, `[`, `!`을 뺐다. `STYLE_ELEMENT`가 이미 본문만
 *    넘겨주므로 지금은 이 안에 태그·CDATA 마커가 나타날 일이 없지만,
 *    혹시라도 넘어온다면 이 문자들이 "중괄호 아닌 글자"로 다시 매치돼
 *    델리미터를 거슬러 넘을 수 있다 — 그 경로를 원천적으로 막아 둔다.
 * ② "license라는 글자가 어디 있든" 매치하던 방식 대신, `.`나 `#`로 시작하는
 *    선택자 토큰 *안에* license가 있어야만 매치하게 했다. 실제로 지우려는
 *    건 `.licenseContainer{…}` 같은 규칙이지, 그 위에 우연히 "released
 *    under a free license" 같은 문구가 낀 주석이 아니다. 이 조건은 이
 *    패턴이 예전에 이웃 `body{…}` 규칙까지 삼켰던 사고(리뷰에서 지적된
 *    과침습, `.css` 브랜치가 지금 이 함수를 아예 안 타는 이유이기도 하다)의
 *    재발도 함께 막는다 — 다음에 이 선택자 조건을 다시 넓히고 싶어지면
 *    그 사고부터 떠올릴 것.
 */
const LICENSE_CSS_RULE =
  /[^{}<>\[\]!]*[.#][\w-]*license[\w-]*[^{}<>\[\]!]*\{[^}]*\}\s*/gi;

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

  // 남은 CSS 규칙(선택자에 license가 들어간 것)도 함께 정리한다. 단
  // `<style>…</style>`의 본문(CSS 텍스트)에만 적용하고 여는/닫는 태그와
  // CDATA 마커는 그대로 둔다 — 왜 다섯 조각으로 나눠 잡는지는
  // `STYLE_ELEMENT` 주석 참고.
  return out.replace(
    STYLE_ELEMENT,
    (
      _match: string,
      openTag: string,
      cdataOpen: string | undefined,
      content: string,
      cdataClose: string | undefined,
      closeTag: string,
    ) =>
      `${openTag}${cdataOpen ?? ""}${content.replace(LICENSE_CSS_RULE, "")}${cdataClose ?? ""}${closeTag}`,
  );
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
      // 디렉터리 항목(zip에 "OPS/fonts/"처럼 슬래시로 끝나는 이름이 들어올
      // 수 있다)은 여기서 basename이 ""가 된다. 그걸 그대로 dropped에
      // 넣으면 droppedHref가 `href.endsWith("")`를 매번 true로 돌려줘서
      // *모든* href가 "지운 파일"로 오판되고, manifest·spine·양쪽 목차가
      // 통째로 비어 버린다 — 파일은 살아 있는데 참조만 전부 끊긴, 조용히
      // 망가진 EPUB이 된다. 그러니 이런 항목은 dropped에 아예 넣지 않는다.
      const basename = path.replace(/^.*\//, "");
      if (basename) dropped.push(basename);
      continue;
    }
    out[path] = data;
  }

  const droppedHref = (href: string) =>
    // 빈 이름은 dropped에 안 들어오지만, 방어적으로 한 번 더 막는다 — 위
    // 필터가 무너지더라도 "" 하나 때문에 모든 href가 걸리는 사고는 여기서
    // 끊는다.
    dropped.some(
      (name) => name !== "" && (href.endsWith(name) || href.endsWith(encodeURI(name))),
    );

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
  const dcSource =
    /<dc:source\b[^>]*>([\s\S]*?)<\/dc:source>/i.exec(opf)?.[1]?.trim();
  const dcIdentifier =
    /<dc:identifier\b[^>]*>([\s\S]*?)<\/dc:identifier>/i.exec(opf)?.[1]?.trim();

  let pageTitle: string | null = null;
  if (dcSource) {
    try {
      pageTitle = toPageTitle(dcSource);
    } catch {
      // dc:source가 위키문헌 주소가 아니면 무시한다 — 호출자가 관리자
      // 입력값으로 대체한다.
      pageTitle = null;
    }
  } else if (dcIdentifier) {
    // dc:identifier는 dc:source와 달리 URN 같은 임의 식별자일 수 있다
    // (실측: `urn:uuid:8f2c-4a11-b9d0`). 그런 값은 `http(s)://`로 시작하지
    // 않으니 toPageTitle이 "URL이 아니면 그대로 제목"으로 받아 버려서
    // urn 문자열 자체가 source_ref가 될 뻔했다 — ws-export가 다시 찾을 수도
    // 없고 내보낼 때마다 값이 달라 중복도 못 잡는 죽은 값이다. 그래서
    // dc:identifier 쪽은 실제 http(s) 위키문헌 주소로 파싱될 때만 받고,
    // 아니면 null로 둬 호출자가 관리자 입력값으로 대체하게 한다.
    try {
      pageTitle = /^https?:\/\//i.test(dcIdentifier) ? toPageTitle(dcIdentifier) : null;
    } catch {
      pageTitle = null;
    }
  }

  return { title: title || null, pageTitle };
}

/**
 * 챕터 XHTML에서 `<body>` 안쪽만 뽑아 태그를 걷어낸 글자만 남긴다.
 *
 * 실제 ws-export 챕터 문서는 `<head>` 안에 `<title>`과 인라인 `<style>`
 * (CSS 텍스트가 그대로 들어간)까지 갖추고 있다. 파일 전체에서 태그만
 * 걷어내면 `<body>`가 통째로 비어도 그 `<title>` 글자와 `<style>` CSS
 * 본문이 살아남아 "글자가 있다"고 오판한다 — 이 검사가 잡으려던 바로 그
 * 파괴를 못 잡는 셈이다. 그래서 `<body>` 바깥은 애초에 보지 않는다.
 * `<body>`가 아예 없으면 글자 없음으로 취급한다.
 */
function chapterBodyText(xhtml: string): string {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml);
  if (!bodyMatch) return "";

  return bodyMatch[1]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/**
 * href가 가리키는 파일 이름이 path의 끝과 일치하는지 본다.
 *
 * `droppedHref`(stripEpub)와 같은 접미사 비교 방식을 그대로 쓴다 — href는
 * OPF 자신의 디렉터리를 기준으로 한 상대 경로라 실제 zip 경로("OPS/…")보다
 * 짧고, 퍼센트 인코딩 여부도 파일마다 다를 수 있어 완전한 경로 조립보다
 * 끝부분 비교 + `encodeURI` 양쪽 다 보는 쪽이 더 안전하다. 여기서 새 규약을
 * 만들지 않고 그 판단을 그대로 재사용한다.
 */
function hrefMatchesPath(path: string, href: string): boolean {
  return path.endsWith(href) || path.endsWith(encodeURI(href));
}

/**
 * OPF manifest의 `<item>` 여는 태그에서 id·href를 뽑는다.
 *
 * self-closing(`<item … />`)이든 아니든 속성은 여는 태그 하나에 다 있으므로
 * `<item …>`까지만 매치하면 충분하다 — 닫는 태그 유무를 신경 쓸 필요가
 * 없다. (Finding 2에서 본, self-closing만 잡는 제거 정규식과 달리 이 읽기
 * 전용 파서는 두 형태를 똑같이 본다.)
 */
function parseManifestItems(opf: string): { id: string; href: string }[] {
  const items: { id: string; href: string }[] = [];
  const openTag = /<item\b[^>]*>/gi;
  for (let m; (m = openTag.exec(opf)) !== null; ) {
    const id = /\bid="([^"]*)"/i.exec(m[0])?.[1];
    const href = /\bhref="([^"]*)"/i.exec(m[0])?.[1];
    if (id && href) items.push({ id, href });
  }
  return items;
}

/** OPF spine의 `<itemref idref="…">`가 가리키는 id 집합. */
function parseSpineIdrefs(opf: string): Set<string> {
  const idrefs = new Set<string>();
  const openTag = /<itemref\b[^>]*>/gi;
  for (let m; (m = openTag.exec(opf)) !== null; ) {
    const idref = /\bidref="([^"]*)"/i.exec(m[0])?.[1];
    if (idref) idrefs.add(idref);
  }
  return idrefs;
}

/**
 * 패키지 무결성 — manifest·spine·실제 파일 세 군데가 서로 앞뒤가 맞는지
 * 본다.
 *
 * 지금까지의 검사는 전부 "뭔가 없어졌는가"만 봤다. "남은 게 서로 가리키고
 * 있는가"는 아무도 안 봤다 — 그래서 zip에 디렉터리 항목 하나만 섞여도
 * manifest·spine·양쪽 목차가 통째로 비는데 이 함수는 그걸 몰랐다(Finding
 * 2). 같은 구멍이 두 가지를 더 조용히 통과시킨다.
 *   ① 챕터 파일 이름이 우연히 걷어낼 파일의 접미사와 겹치면(예:
 *      "c2_subtitle.xhtml"이 "title.xhtml"로 끝남) `droppedHref`가 잘못
 *      걸려 그 챕터의 manifest 항목·spine 항목·목차 항목만 지워진다. 파일은
 *      그대로 남지만 뷰어는 목차로도 spine으로도 그 챕터에 닿을 수 없다.
 *   ② non-self-closing `<item>…</item>`은 stripEpub의 제거 정규식(self-
 *      closing 전용)을 피해 간다. 가리키던 파일(예: 폰트)이 지워졌어도
 *      item·itemref는 살아남아 없는 파일을 가리킨다.
 * 두 경우 다 "파일 존재 여부"만 보는 검사로는 못 잡고, manifest·spine을
 * 실제 파일과 맞대봐야 잡힌다.
 */
function assertPackageIntegrity(
  paths: string[],
  entries: Record<string, Uint8Array>,
  chapterPaths: string[],
  problems: string[],
): void {
  const opfPath = paths.find((p) => /\.opf$/i.test(p));
  if (!opfPath) return; // opf가 없으면 이 검사는 못 한다 — 다른 검사가 이미 문제를 잡는다.

  const opf = strFromU8(entries[opfPath]);
  const items = parseManifestItems(opf);
  const spineIdrefs = parseSpineIdrefs(opf);

  for (const chapterPath of chapterPaths) {
    const item = items.find((it) => hrefMatchesPath(chapterPath, it.href));
    if (!item) {
      problems.push(`챕터 파일은 남았지만 manifest 항목이 없음: ${chapterPath}`);
      continue;
    }
    if (!spineIdrefs.has(item.id)) {
      problems.push(`챕터의 spine 항목(itemref) 없음: ${chapterPath}`);
    }
  }

  for (const item of items) {
    if (!paths.some((p) => hrefMatchesPath(p, item.href))) {
      problems.push(`manifest이 존재하지 않는 파일을 가리킴: ${item.href}`);
    }
  }
}

/**
 * 본문 어딘가에 「라이선스」 텍스트만 담은 제목이 남아 있는지 본다.
 *
 * stripLicenseBlocks가 상자를 섹션째 못 지우고 상자만 지우면(전제부가 실제
 * 산문을 담고 있어 가드가 걸렸거나, 판정 로직에 다른 구멍이 또 생기거나)
 * 그 섹션의 <h2>라이선스</h2> 제목만 챕터 끝에 고아로 남는다. 이 검사는
 * 그 잔재를 licenseContainer 문자열이 아니라 제목 텍스트로 직접 잡는다 —
 * 상자는 이미 없어졌으니 licenseContainer 검사는 이 경우를 못 본다.
 */
function hasOrphanLicenseHeading(body: string): boolean {
  const heading = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi;
  for (let m; (m = heading.exec(body)) !== null; ) {
    if (extractText(m[0]) === "라이선스") return true;
  }
  return false;
}

/**
 * 챕터 XHTML마다 `<style>`/`</style>`, `<![CDATA[`/`]]>` 개수가 서로
 * 맞는지 본다.
 *
 * stripLicenseBlocks의 CSS 정리 정규식이 델리미터를 넘어 태그나 CDATA
 * 마커까지 삼키면(실물 「운수 좋은 날」 EPUB에서 겪은 사고) 결과는 "지워야
 * 할 라이선스 상자가 남는" 실패가 아니라 "짝이 어긋난 `<style>`·CDATA
 * 마커가 낀 챕터"다. `licenseContainer` 문자열 검사는 상자가 이미 지워진
 * 뒤라 이 사고를 못 본다. EPUB 챕터는 XML로 파싱되므로 짝이 안 맞으면
 * 엄격한 리더는 파일을 못 열고, 관대한 리더는 `]]>`를 화면에 그대로
 * 찍는다 — 어느 쪽도 조용히 넘어가면 안 되는 결함이라 챕터마다 개수를
 * 센다(챕터 전체를 이어 붙여 한 번에 세면, 한 챕터가 여는 태그를 하나
 * 빠뜨리고 다른 챕터가 닫는 태그를 하나 더 갖는 식으로 우연히 합이 맞아
 * 떨어져 이 검사를 조용히 통과할 수 있다).
 */
function assertStyleBalance(
  chapterPaths: string[],
  entries: Record<string, Uint8Array>,
  problems: string[],
): void {
  for (const path of chapterPaths) {
    const text = strFromU8(entries[path]);

    const openStyle = (text.match(/<style\b/gi) ?? []).length;
    const closeStyle = (text.match(/<\/style>/gi) ?? []).length;
    if (openStyle !== closeStyle) {
      problems.push(
        `style 태그 개수가 안 맞음: ${path} (여는 ${openStyle}개, 닫는 ${closeStyle}개)`,
      );
    }

    const openCdata = (text.match(/<!\[CDATA\[/g) ?? []).length;
    const closeCdata = (text.match(/\]\]>/g) ?? []).length;
    if (openCdata !== closeCdata) {
      problems.push(
        `CDATA 마커 개수가 안 맞음: ${path} (여는 ${openCdata}개, 닫는 ${closeCdata}개)`,
      );
    }
  }
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
  if (hasOrphanLicenseHeading(body)) problems.push("고아 라이선스 제목");

  const chapterPaths = paths.filter((p) => /\/c\d+_.*\.xhtml$/i.test(p));
  if (chapterPaths.length === 0) {
    problems.push("본문 챕터 없음");
  } else if (
    // 챕터 파일은 있지만 어느 챕터에도 글자가 하나도 없는 경우 — 섹션을
    // 통째로 잘못 지웠을 때(Finding 1류 버그) 나는 증상이라, 경로 존재
    // 여부만 보는 지금까지의 검사로는 못 잡는다.
    //
    // "하나라도 비면 실패"가 아니라 "전부 비어야 실패"인 이유: 위키문헌
    // 챕터 중에는 삽화 한 장만 있는 도판 페이지가 실제로 존재하고, 그런
    // 페이지는 원래부터 본문 텍스트가 없다. 다장 도서에서 도판 한 장 때문에
    // 멀쩡한 나머지 챕터까지 통째로 게이트에 걸리는 걸 막으려는 것이다.
    // 대신 "일부만 파괴됐지만 나머지는 살아 있는" 경우는 이 검사로 못
    // 잡는다는 걸 감수한 절충이다 — 다음에 조건을 좁히고 싶어지면 이 주석을
    // 먼저 읽을 것.
    chapterPaths.every((p) => chapterBodyText(strFromU8(entries[p])).length === 0)
  ) {
    problems.push("본문 챕터가 전부 비어 있음");
  }

  assertStyleBalance(chapterPaths, entries, problems);
  assertPackageIntegrity(paths, entries, chapterPaths, problems);

  if (problems.length > 0) {
    throw new Error(
      `받아온 EPUB 정리에 실패했습니다 — ${problems.join(", ")}. ` +
        `위키문헌의 문서 구조가 바뀌었을 수 있습니다 (src/lib/wikisource.ts).`,
    );
  }
  return chapterPaths.length;
}
