/**
 * 위키문헌에서 가져올 수 있는 작품 후보를 받아 wikisource_works를 채운다.
 *
 *   npm run wikisource:sync -- --dry-run   (쓰지 않고 무엇이 바뀔지만 본다)
 *   npm run wikisource:sync                (실제로 쓴다 — 운영 DB가 바뀐다)
 *
 * **이 프로젝트는 개발용 DB가 따로 없다.** 쓰기는 곧 운영을 바꾼다. 그래서
 * --dry-run이 선택이 아니라 전제다: 먼저 돌려 보고, 보고가 납득되면 쓴다.
 *
 * 레이트 리밋이 이 스크립트의 형태를 정했다. 실측으로 세 번 차단당했다 —
 * 50개 묶음 + 120ms에서 즉시, 20개 + 1초에서 백오프 11회, 20개 + 2초에서도
 * 걸렸다. 순차·2초·20개·백오프를 줄이지 말 것. 총 요청 약 47회로 2분쯤
 * 걸리고, 사람이 드물게 돌리는 스크립트라 그 정도는 무해하다.
 *
 * service role 키를 쓰므로 RLS를 우회한다.
 */

import { createClient } from "@supabase/supabase-js";
import {
  SCOPE_GENRES,
  isCandidate,
  parseCategories,
  parseHeader,
} from "../src/lib/wikisource-meta.ts";

const API = "https://ko.wikisource.org/w/api.php";
const USER_AGENT = "ttokttok/0.1 (https://github.com/ttokttok; content sourcing)";

/** 요청 사이 최소 간격. 2초에서도 걸린 적이 있으니 줄이지 말 것. */
const GAP_MS = 2000;

/** 한 요청에 담는 제목 수. 50개는 즉시 차단당했다. */
const BATCH = 20;

/** 제한 응답 백오프: 10 → 20 → 30 → 40 → 50초, 최대 5회. */
const MAX_RETRY = 5;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.\n" +
      "실행: npm run wikisource:sync -- --dry-run",
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * API를 한 번 부른다. 제한에 걸리면 백오프하고 재시도한다.
 *
 * 위키문헌은 제한을 걸 때 JSON이 아닌 본문을 돌려준다("You are making too
 * many requests to the API.") — 그래서 파싱 실패를 제한 신호로 읽는다.
 * 상태 코드만 보면 놓친다.
 */
async function api(params, attempt = 0) {
  const res = await fetch(`${API}?${params}&format=json`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const text = await res.text();

  // 다음 요청 전에 무조건 쉰다. 성공했을 때도 쉬어야 누적 할당량에 걸리지 않는다.
  await sleep(GAP_MS);

  try {
    return JSON.parse(text);
  } catch {
    if (attempt < MAX_RETRY) {
      const wait = 10000 * (attempt + 1);
      console.log(`  ! 제한 — ${wait / 1000}초 대기 후 재시도`);
      await sleep(wait);
      return api(params, attempt + 1);
    }
    throw new Error(`위키문헌 API 응답을 읽을 수 없다: ${text.slice(0, 120)}`);
  }
}

/** 분류의 문서를 모두 나열한다. namespace 0(본문)만, cmcontinue로 이어받는다. */
async function listCategory(category) {
  const titles = [];
  let cont = "";

  do {
    const r = await api(
      `action=query&list=categorymembers&cmnamespace=0&cmlimit=500` +
        `&cmtitle=${encodeURIComponent(`분류:${category}`)}` +
        (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ""),
    );
    titles.push(...r.query.categorymembers.map((m) => m.title));
    cont = r.continue?.cmcontinue ?? "";
  } while (cont);

  return titles;
}

/**
 * 여러 문서의 속성을 한 번에 받는다.
 *
 * `continue`를 처리하는 이유: 분류가 많은 문서에서 잘리면 장르가 조용히
 * 사라져 그 작품이 목록에서 빠진다. `cllimit=500`이면 20개 묶음에서 거의
 * 안 걸리지만, "거의"에 기대면 언젠가 한 작품이 이유 없이 사라진다.
 *
 * 이어받은 응답은 해당 문서의 **나머지** 분류만 담고 온다(위키미디어 API의
 * 표준 continue 계약 — clcontinue가 정확히 어디서 끊겼는지를 가리킨다).
 * 그래서 이미 완결된 문서는 이어받는 라운드에 categories 키 없이 다시
 * 나타나거나 아예 나타나지 않는다 — `if (page.categories)` 가드가 그 경우
 * prev를 건드리지 않게 막는다. 만에 하나 위키미디어가 문서를 통째로 다시
 * 돌려주더라도 여기서는 이어 붙이기만 하므로 최악의 경우 중복 항목이 생길
 * 뿐이다(아래 파싱은 전부 Set/Math.min 기반이라 중복에 영향받지 않는다) —
 * 데이터가 사라지는 방향의 실패는 없다. 합성 다중 라운드 응답으로 오프라인
 * 검증함(스크립트 밖, 위키문헌 요청 없이).
 */
async function fetchProp(titles, extra) {
  const merged = new Map();
  let cont = null;

  do {
    const contParams = cont
      ? Object.entries(cont)
          .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
          .join("")
      : "";

    const r = await api(
      `action=query&titles=${encodeURIComponent(titles.join("|"))}${extra}${contParams}`,
    );

    for (const page of Object.values(r.query?.pages ?? {})) {
      const prev = merged.get(page.title);
      if (!prev) {
        merged.set(page.title, page);
        continue;
      }
      // 이어받은 응답은 같은 문서의 나머지 분류만 담고 온다 — 이어 붙인다.
      if (page.categories) prev.categories = [...(prev.categories ?? []), ...page.categories];
      if (page.revisions) prev.revisions = page.revisions;
    }

    cont = r.continue ?? null;
  } while (cont);

  return merged;
}

/**
 * 요청에는 있었지만 응답에서 위키문헌이 "없는 문서"로 표시한 제목인지 본다.
 *
 * 장르 분류를 나열한 시점과 속성을 받는 시점 사이에 문서가 삭제되면 이
 * 경우다. `categories`가 없어 `parseCategories([])`가 `genre: null`을
 * 주므로 `범위 밖 장르`로 집계되는데, 우리는 장르로 크롤했으니 그 사유가
 * 나오면 안 된다 — 나온다면 이 함수가 "삭제됐다"와 "파싱이 틀렸다"를
 * 구분하는 유일한 단서다.
 */
function isMissingFromResponse(page) {
  return !page || page.missing !== undefined;
}

function progress(done, total, label) {
  console.log(`  [${String(done).padStart(3)}/${total}] ${label}`);
}

async function run() {
  console.log(
    dryRun
      ? "· --dry-run — 쓰지 않고 무엇이 바뀔지만 본다.\n"
      : "· 실제로 쓴다. 이 프로젝트는 개발용 DB가 없어 운영이 바뀐다.\n",
  );

  // ---- 1) 장르 분류를 나열해 후보 제목을 모은다 (요청 9회) ----
  console.log(`=== 장르 분류 ${SCOPE_GENRES.length}개를 나열한다 ===`);
  const union = new Set();

  for (const genre of SCOPE_GENRES) {
    const titles = await listCategory(genre);
    titles.forEach((t) => union.add(t));
    console.log(`  ${String(titles.length).padStart(4)}  ${genre}`);
  }

  const allTitles = [...union];
  console.log(`  ────────────────`);
  console.log(`  ${String(allTitles.length).padStart(4)}  중복 제거 합계\n`);

  if (allTitles.length === 0) {
    throw new Error(
      "후보가 하나도 없다. 위키문헌이 분류를 개편했거나 요청이 전부 실패했다 — 표를 건드리지 않고 멈춘다.",
    );
  }

  // ---- 2) 분류와 위키텍스트를 받아 파싱한다 (요청 약 38회) ----
  console.log(`=== 문서별 메타데이터를 받는다 (${BATCH}개씩) ===`);

  const candidates = [];
  // 키는 isCandidate가 돌려주는 사유 문자열 그대로다. 전부 인용해 둔다 —
  // 하나만 따옴표를 빼면 사유 목록이 아니라 뒤섞인 리터럴로 읽힌다.
  const excluded = {
    "범위 밖 장르": 0,
    "하위 문서": 0,
    "친일문학": 0,
    "PD 태그 없음": 0,
  };
  let noAuthor = 0;
  let translated = 0;
  // "범위 밖 장르"로 집계된 것 중 실제로는 "응답에서 사라진 문서"인 수.
  // 장르로 크롤했으므로 이 사유의 나머지(추정 파싱 오류)는 0이어야 한다.
  let missingFromResponse = 0;

  for (let i = 0; i < allTitles.length; i += BATCH) {
    const chunk = allTitles.slice(i, i + BATCH);

    const cats = await fetchProp(chunk, "&prop=categories&cllimit=500");
    const revs = await fetchProp(chunk, "&prop=revisions&rvslots=main&rvprop=content");

    for (const title of chunk) {
      const catPage = cats.get(title);
      const catNames = (catPage?.categories ?? []).map((c) => c.title);
      const meta = parseCategories(catNames);

      const verdict = isCandidate(meta);
      if (!verdict.ok) {
        excluded[verdict.reason]++;
        if (verdict.reason === "범위 밖 장르" && isMissingFromResponse(catPage)) {
          missingFromResponse++;
        }
        continue;
      }

      const wikitext =
        revs.get(title)?.revisions?.[0]?.slots?.main?.["*"] ?? "";
      const header = parseHeader(wikitext);

      if (!header.author) noAuthor++;
      if (header.translator) translated++;

      candidates.push({
        page_title: title,
        title: header.title ?? title,
        author: header.author,
        genre: meta.genre,
        pub_year: meta.pubYear,
        pd_tag: meta.pdTag,
        translator: header.translator,
        synced_at: new Date().toISOString(),
      });
    }

    progress(Math.min(i + BATCH, allTitles.length), allTitles.length, `후보 ${candidates.length}개`);
  }

  // ---- 3) 보고 ----
  console.log(`\n=== 제외 ===`);
  for (const [reason, n] of Object.entries(excluded)) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
    if (reason === "범위 밖 장르" && n > 0) {
      console.log(
        `        (그중 응답에서 "없는 문서"로 표시된 것 ${missingFromResponse}개 — ` +
          `두 호출 사이 삭제된 것으로 보인다. 나머지 ${n - missingFromResponse}개는 ` +
          `장르로 크롤했는데도 장르가 없다는 뜻이라 parseCategories를 의심해야 한다)`,
      );
    }
  }
  console.log(`  ────────────────`);
  console.log(`  ${String(candidates.length).padStart(4)}  표에 담을 것`);
  console.log(`\n  저자 파싱 실패 ${noAuthor}개 — 목록에 남고 가져올 때 입력받는다`);
  console.log(`  번역물 ${translated}개 — 표에는 담고 목록에서 가린다`);

  // ---- 4) 기존 행과 비교 ----
  const { data: existing, error: readErr } = await db
    .from("wikisource_works")
    .select("page_title");
  if (readErr) throw new Error(`wikisource_works 조회: ${readErr.message}`);

  const had = new Set(existing.map((r) => r.page_title));
  const nextTitles = new Set(candidates.map((c) => c.page_title));
  const added = candidates.filter((c) => !had.has(c.page_title));
  const removed = [...had].filter((t) => !nextTitles.has(t));

  console.log(`\n=== 변경 ===`);
  console.log(`  신규 ${added.length} · 갱신 ${candidates.length - added.length} · 삭제 ${removed.length}`);
  if (added.length) console.log(`  신규 예: ${added.slice(0, 5).map((c) => c.title).join(", ")}`);
  if (removed.length) console.log(`  삭제 예: ${removed.slice(0, 5).join(", ")}`);

  if (dryRun) {
    console.log(`\n· --dry-run이라 아무것도 쓰지 않았다.`);
    return;
  }

  /**
   * 부분 실패로 표를 비우지 않기 위한 관문.
   *
   * 레이트 리밋 때문에 크롤이 중간에 실패한 적이 실제로 여러 번 있다. 그때
   * 후보가 적게 모이는데, 그걸 그대로 반영하면 "위키문헌에서 사라진 문서"로
   * 오인해 표를 대량 삭제한다. 다음 동기화가 되돌리기는 하지만 그 사이의
   * 목록은 텅 비어 있다.
   */
  if (had.size > 0 && candidates.length < had.size * 0.7 && !force) {
    throw new Error(
      `후보가 기존 ${had.size}개의 70% 미만(${candidates.length}개)이다. ` +
        `크롤이 중간에 실패했을 가능성이 높아 멈춘다. ` +
        `의도한 축소라면 --force를 붙인다.`,
    );
  }

  // ---- 5) upsert + 사라진 행 삭제 ----
  const { error: upErr } = await db
    .from("wikisource_works")
    .upsert(candidates, { onConflict: "page_title" });
  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  if (removed.length) {
    const { error: delErr } = await db
      .from("wikisource_works")
      .delete()
      .in("page_title", removed);
    if (delErr) throw new Error(`삭제: ${delErr.message}`);
  }

  console.log(`\n✓ ${candidates.length}개 반영 완료 (삭제 ${removed.length})`);
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
