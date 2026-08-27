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
  return stripFonts(raw);
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
