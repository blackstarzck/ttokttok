/**
 * 한국 위키문헌 → EPUB 수급 (PRD §5.11).
 *
 * ws-export(`ws-export.wmcloud.org`)가 위키문헌 페이지를 EPUB으로 만들어 준다.
 * 하위 페이지(장별 분할)와 ProofreadPage 트랜스클루전(PDF 스캔 교정본)도
 * 알아서 따라가므로, 목차 페이지 하나만 지정하면 된다.
 *
 * 다만 ws-export는 FreeSerif 4종(약 7.7MB)을 항상 임베드하고 끄는 옵션이
 * 없다. 본문이 34KB인 단편도 4.3MB가 되어 모바일에서 첫 페이지까지
 * 한참 걸린다 — 우리는 epub.js에 자체 CSS를 물리므로 이 폰트는 쓰이지도
 * 않는다. 그래서 받아온 뒤 폰트를 걷어낸다.
 *
 * 또 ws-export는 위키문헌 자신의 껍데기를 함께 넣는다: 로고가 박힌 표지
 * 페이지, 기여자 목록이 담긴 "About this digital edition", 본문 끝의
 * 「라이선스」 안내 상자. 우리 판본의 첫 화면이 남의 로고일 수는 없으므로
 * 이것도 걷어낸다. 다만 content.opf의 dc:rights·dc:contributor 메타데이터는
 * 남긴다 — 화면에 안 보이는 출처 기록이고, 지우는 건 권리 표시를 떼는
 * 별개의 판단이다. 수급 출처는 books.source·rights_note에도 적힌다 (PRD §5.11).
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const WS_EXPORT = "https://ws-export.wmcloud.org/";
const USER_AGENT = "ttokttok/0.1 (https://github.com/ttokttok; dev seeding)";

/** EPUB 스펙: mimetype은 첫 항목이어야 하고 압축하면 안 된다. */
const MIMETYPE = "mimetype";

/**
 * 위키문헌 페이지를 EPUB으로 받아 폰트를 제거한 Buffer를 돌려준다.
 * @param {string} pageTitle 위키문헌 문서 제목 (예: "운수 좋은 날")
 */
export async function fetchEpub(pageTitle) {
  const url = `${WS_EXPORT}?format=epub&lang=ko&page=${encodeURIComponent(pageTitle)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    throw new Error(`ws-export HTTP ${res.status} (${pageTitle})`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!/epub/i.test(contentType)) {
    const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`EPUB이 아닌 응답 (${pageTitle}): ${body}`);
  }

  const raw = Buffer.from(await res.arrayBuffer());
  return stripWikisourceChrome(stripFonts(raw));
}

/** 위키문헌 껍데기 파일 — 우리 판본에 실리면 안 되는 것들. */
const CHROME_FILES = [/(^|\/)title\.xhtml$/i, /(^|\/)about\.xhtml$/i];

/** 위키문헌 로고와 라이선스 상자의 아이콘(PD 마크·경고 삼각형). */
const CHROME_IMAGES = [/Wikisource-logo/i, /PD_icon/i, /ructive_black_darkred/i];

/**
 * `<tag …>`로 시작하는 지점부터 짝이 맞는 닫는 태그까지의 구간을 지운다.
 * 라이선스 상자는 div가 여러 겹 중첩돼 있어 단순 비탐욕 정규식으로는
 * 중간에서 끊긴다 — 깊이를 세야 통째로 걷어낼 수 있다.
 */
function removeBlockAt(html, tag, startIndex) {
  const open = new RegExp(`<${tag}\\b`, "gi");
  const close = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 0;
  let i = startIndex;

  while (i < html.length) {
    open.lastIndex = i;
    close.lastIndex = i;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return html; // 짝이 없다 — 건드리지 않는다

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + 1;
      continue;
    }
    depth--;
    if (depth === 0) {
      return html.slice(0, startIndex) + html.slice(nextClose.index + nextClose[0].length);
    }
    i = nextClose.index + 1;
  }
  return html;
}

/** 라이선스 상자를 여는 태그 — 클래스로만 식별된다(태그 종류는 책마다 다르다). */
const LICENSE_OPEN = /<(section|div)\b[^>]*class="[^"]*licenseContainer[^"]*"[^>]*>/i;

/**
 * 본문에서 「라이선스」 상자를 걷어낸다.
 *
 * ws-export는 상자를 `<section data-mw-section-id="…">`으로 감싸고 그 안에
 * 「라이선스」 제목까지 넣는다. 상자만 지우면 제목이 남으므로, 상자를 품은
 * 섹션을 통째로 지운다. 섹션 없이 div만 붙는 판본도 있어 그 경우도 처리한다.
 *
 * `<head>`의 CSS에도 `.licenseContainer{…}` 규칙이 들어 있는데, 이건 본문이
 * 아니라 스타일이라 따로 지운다 — 먼저 문자열을 찾으면 CSS가 걸려서 정작
 * 본문 상자를 못 찾는다.
 */
function stripLicenseBlocks(html) {
  let out = html;

  for (;;) {
    const hit = LICENSE_OPEN.exec(out);
    if (!hit) break;

    // 상자를 품은 섹션이 있으면 섹션째, 없으면 상자만 지운다.
    const sectionOpen = /<section\b[^>]*>/gi;
    let sectionStart = -1;
    for (let m; (m = sectionOpen.exec(out)) !== null && m.index < hit.index; ) {
      sectionStart = m.index;
    }

    const target =
      sectionStart !== -1
        ? { tag: "section", start: sectionStart }
        : { tag: hit[1], start: hit.index };

    const next = removeBlockAt(out, target.tag, target.start);
    if (next === out) break; // 못 지웠다 — 무한루프 방지
    out = next;
  }

  // 남은 CSS 규칙(선택자에 license가 들어간 것)도 함께 정리한다.
  return out.replace(/[^{}]*license[^{}]*\{[^}]*\}/gi, "");
}

/**
 * 위키문헌 표지·정보 페이지와 라이선스 상자를 제거한다.
 *
 * 파일만 지우면 안 된다 — content.opf의 manifest·spine, nav.xhtml, toc.ncx에
 * 남은 참조를 함께 끊어야 뷰어가 없는 파일을 찾지 않는다 (stripFonts와 같은 이유).
 */
export function stripWikisourceChrome(epubBuffer) {
  const entries = unzipSync(new Uint8Array(epubBuffer));
  const dropped = [];
  const out = {};

  for (const [path, data] of Object.entries(entries)) {
    const isChrome =
      CHROME_FILES.some((re) => re.test(path)) ||
      (/(^|\/)images\//i.test(path) && CHROME_IMAGES.some((re) => re.test(path)));

    if (isChrome) {
      dropped.push(path.replace(/^.*\//, ""));
      continue;
    }
    out[path] = data;
  }

  const droppedHref = (href) =>
    dropped.some((name) => href.endsWith(name) || href.endsWith(encodeURI(name)));

  for (const [path, data] of Object.entries(out)) {
    if (/content\.opf$/i.test(path)) {
      let opf = strFromU8(data);

      // 지운 파일의 manifest 항목과, 그 id를 가리키는 spine 항목을 함께 뺀다.
      const removedIds = [];
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
    } else if (/nav\.xhtml$/i.test(path)) {
      // 목차에서 표지·정보 항목을 뺀다 (뷰어 목차 시트에 그대로 노출된다).
      const nav = strFromU8(data).replace(
        /<li\b[^>]*>\s*<a\b[^>]*href="([^"]*)"[^>]*>.*?<\/a>\s*<\/li>\s*/gis,
        (li, href) => (droppedHref(href) ? "" : li),
      );
      out[path] = strToU8(nav);
    } else if (/toc\.ncx$/i.test(path)) {
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
    }
  }

  const ordered = {};
  if (out[MIMETYPE]) ordered[MIMETYPE] = [out[MIMETYPE], { level: 0 }];
  for (const [path, data] of Object.entries(out)) {
    if (path === MIMETYPE) continue;
    ordered[path] = data;
  }

  return Buffer.from(zipSync(ordered, { level: 6 }));
}

/**
 * EPUB에서 임베드 폰트를 제거한다.
 * 파일 삭제만으로는 부족하고, content.opf의 manifest 항목과 main.css의
 * @font-face 선언도 함께 지워야 뷰어가 없는 파일을 찾지 않는다.
 */
export function stripFonts(epubBuffer) {
  const entries = unzipSync(new Uint8Array(epubBuffer));
  const out = {};

  for (const [path, data] of Object.entries(entries)) {
    if (/(^|\/)fonts\//i.test(path)) continue; // 폰트 파일 자체
    out[path] = data;
  }

  for (const [path, data] of Object.entries(out)) {
    if (/content\.opf$/i.test(path)) {
      const opf = strFromU8(data)
        // <item ... href="fonts/…" /> 제거
        .replace(/<item\b[^>]*href="[^"]*fonts\/[^"]*"[^>]*\/>\s*/gi, "");
      out[path] = strToU8(opf);
    } else if (/\.css$/i.test(path)) {
      const css = strFromU8(data)
        // @font-face { … } 블록 제거
        .replace(/@font-face\s*\{[^}]*\}\s*/gi, "");
      out[path] = strToU8(css);
    }
  }

  // mimetype을 무압축으로 먼저 넣는다 (EPUB 스펙).
  const ordered = {};
  if (out[MIMETYPE]) ordered[MIMETYPE] = [out[MIMETYPE], { level: 0 }];
  for (const [path, data] of Object.entries(out)) {
    if (path === MIMETYPE) continue;
    ordered[path] = data;
  }

  return Buffer.from(zipSync(ordered, { level: 6 }));
}
