/**
 * 도서 커버 생성 → Supabase Storage 업로드 → books.cover_url 갱신.
 *
 *   node --env-file=.env scripts/generate-covers.mjs
 *   node --env-file=.env scripts/generate-covers.mjs --force   (이미 있어도 다시 생성)
 *
 * 왜 직접 만드는가: 시드 도서는 저작권이 만료된 근대문학이고, 우리가 위키문헌
 * 등에서 만든 우리 판본이다. 상용 출판사 판본의 표지 이미지는 그 출판사의
 * 저작물이라 가져다 쓸 수 없고, 애초에 우리 판본의 표지도 아니다.
 * 자기 판본의 표지는 판본을 낸 쪽이 만드는 게 맞다.
 *
 * DESIGN.md Overview: "UI는 무채색으로 물러나고, 색은 도서 커버가 낸다."
 * 그래서 커버만은 유채색을 쓴다 — 피드에서 색을 내는 유일한 요소다.
 *
 * 파일명은 `{book.id}.png` 고정이라 재실행하면 덮어쓴다(멱등).
 */

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.\n" +
      "실행: node --env-file=.env scripts/generate-covers.mjs",
  );
  process.exit(1);
}

const force = process.argv.includes("--force");
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const W = 800;
const H = 1200; // 2:3 — BookCover의 aspect-[2/3]와 일치

/** 표지 팔레트. 어두운 UI 위에서 색을 내되 튀지 않는 깊은 톤. */
const PALETTES = [
  { from: "#1b2a4a", to: "#0d1526", accent: "#e8c56a", label: "#93a6c8" }, // 감청
  { from: "#43202a", to: "#1d0d12", accent: "#e0a3a3", label: "#c08e8e" }, // 자주
  { from: "#1c3a2e", to: "#0c1a14", accent: "#9fd4a8", label: "#7fae88" }, // 심록
  { from: "#3d2c1a", to: "#1a120a", accent: "#d9b483", label: "#b2926a" }, // 갈다
  { from: "#2a2545", to: "#120f1f", accent: "#b8a6e8", label: "#8f83b8" }, // 보라
  { from: "#123b42", to: "#08191d", accent: "#8fd0da", label: "#6fa5ad" }, // 청록
];

/** 제목 해시로 팔레트를 고정 — 재생성해도 같은 책은 같은 색. */
function pickPalette(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

const escapeXml = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

/** 한글은 글자 폭이 대체로 font-size와 같고, 공백·영문은 그보다 좁다. */
const widthOf = (s, fontSize) =>
  [...s].reduce((sum, ch) => sum + (/[가-힣　-〿]/.test(ch) ? 1 : 0.55), 0) *
  fontSize;

/** 주어진 폭으로 탐욕적으로 끊는다. 한 단어가 넘치면 글자 단위로 자른다. */
function greedyWrap(text, maxWidthPx, fontSize) {
  const lines = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate, fontSize) <= maxWidthPx || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  return lines.flatMap((l) => {
    if (widthOf(l, fontSize) <= maxWidthPx) return [l];
    const out = [];
    let cur = "";
    for (const ch of l) {
      if (widthOf(cur + ch, fontSize) > maxWidthPx && cur) {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  });
}

/**
 * 줄 수를 유지하면서 줄 길이를 고르게 맞춘다.
 * 탐욕적 줄바꿈은 "하늘과 바람과 별과 / 시"처럼 마지막 줄에 한 글자만
 * 남기는 고아 줄을 만든다. 같은 줄 수라면 균등한 쪽이 보기 좋다.
 */
function wrap(text, maxWidthPx, fontSize) {
  const lines = greedyWrap(text, maxWidthPx, fontSize);
  if (lines.length < 2) return lines;

  // 같은 줄 수를 유지하는 가장 좁은 폭을 찾으면 줄 길이가 저절로 고르게 맞는다.
  // ("하늘과 바람과 별과 / 시" → "하늘과 바람과 / 별과 시")
  const target = lines.length;
  let lo = 0;
  let hi = maxWidthPx;
  let best = lines;

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = greedyWrap(text, mid, fontSize);
    if (candidate.length <= target) {
      best = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return best;
}

function buildSvg({ title, author, category }) {
  const p = pickPalette(title);
  const margin = 72;
  const inner = W - margin * 2;

  // 제목이 길수록 작게. 3줄을 넘기지 않는 선에서 크게 잡는다.
  let fontSize = title.length <= 6 ? 82 : title.length <= 12 ? 66 : 54;
  let lines = wrap(title, inner, fontSize);
  while (lines.length > 3 && fontSize > 38) {
    fontSize -= 6;
    lines = wrap(title, inner, fontSize);
  }

  const lineHeight = Math.round(fontSize * 1.35);
  const blockHeight = lines.length * lineHeight;

  // 제목·구분선·저자를 한 덩어리로 보고, 그 덩어리의 중심을 화면 58%에 둔다.
  // 정중앙에 놓으면 아래쪽이 휑해 보인다.
  const groupHeight = blockHeight + 56 + 3 + 56;
  const titleTop = Math.round(H * 0.58 - groupHeight / 2);

  const titleTspans = lines
    .map(
      (l, i) =>
        `<tspan x="${margin}" y="${titleTop + i * lineHeight + fontSize}">${escapeXml(l)}</tspan>`,
    )
    .join("");

  const ruleY = titleTop + blockHeight + 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${p.from}"/>
      <stop offset="100%" stop-color="${p.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.15" r="0.8">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- 책등을 암시하는 좌측 띠 -->
  <rect x="0" y="0" width="14" height="${H}" fill="#000000" opacity="0.25"/>
  <rect x="14" y="0" width="2" height="${H}" fill="${p.accent}" opacity="0.35"/>

  <!-- 안쪽 테두리 -->
  <rect x="${margin - 26}" y="${margin - 26}" width="${W - (margin - 26) * 2}" height="${H - (margin - 26) * 2}"
        fill="none" stroke="${p.accent}" stroke-opacity="0.22" stroke-width="1.5"/>

  <text font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="24" letter-spacing="6"
        fill="${p.label}" x="${margin}" y="${margin + 40}">${escapeXml(category)}</text>

  <text font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="${fontSize}" font-weight="bold"
        fill="#ffffff">${titleTspans}</text>

  <rect x="${margin}" y="${ruleY}" width="72" height="3" fill="${p.accent}"/>

  <text font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="30"
        fill="${p.label}" x="${margin}" y="${ruleY + 56}">${escapeXml(author)}</text>

  <text font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="20"
        fill="${p.label}" fill-opacity="0.7" x="${margin}" y="${H - margin}">똑똑</text>
</svg>`;
}

async function run() {
  const { data: books, error } = await db
    .from("books")
    .select("id, title, author, category, cover_url")
    .order("title");

  if (error) throw new Error(`books 조회: ${error.message}`);
  if (!books?.length) {
    console.log("도서가 없다. 먼저 npm run seed 를 실행할 것.");
    return;
  }

  let made = 0;
  let skipped = 0;

  for (const book of books) {
    if (book.cover_url && !force) {
      skipped++;
      continue;
    }

    const png = await sharp(Buffer.from(buildSvg(book))).png().toBuffer();
    const path = `${book.id}.png`;

    const { error: upErr } = await db.storage
      .from("covers")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`업로드 ${book.title}: ${upErr.message}`);

    const {
      data: { publicUrl },
    } = db.storage.from("covers").getPublicUrl(path);

    const { error: dbErr } = await db
      .from("books")
      .update({ cover_url: publicUrl })
      .eq("id", book.id);
    if (dbErr) throw new Error(`cover_url 갱신 ${book.title}: ${dbErr.message}`);

    console.log(`✓ ${book.title} (${Math.round(png.length / 1024)}KB)`);
    made++;
  }

  console.log(
    `\n커버 ${made}장 생성.${skipped ? ` ${skipped}장은 이미 있어 건너뜀 (--force로 재생성).` : ""}`,
  );
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
