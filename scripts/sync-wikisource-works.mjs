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
 * 걸렸다. 순차·2초·20개·백오프를 줄이지 말 것. 총 요청 약 51회(작품 47 +
 * 저자 문서 4)로 2분쯤 걸리고, 사람이 드물게 돌리는 스크립트라 그 정도는
 * 무해하다.
 *
 * service role 키를 쓰므로 RLS를 우회한다.
 */

import { createClient } from "@supabase/supabase-js";
import {
  EXCLUSION_REASONS,
  SCOPE_GENRES,
  authorPageTitle,
  checkAuthor,
  eraConsistent,
  isCandidate,
  parseAuthorPage,
  parseCategories,
  parseHeader,
} from "../src/lib/wikisource-meta.ts";
// 문서 제목 정규화의 원천은 하나다 — books.source_ref와 같은 함수를 거쳐야
// "이미 등록됨" 판정이 성립한다 (PRD §11-51).
import { toPageTitle } from "../src/lib/wikisource.ts";

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
 *
 * 작품 문서(`titles=`가 일반 제목)와 저자 문서(`titles=`가 `저자:` 접두
 * 제목)를 가리지 않는다 — MediaWiki는 이름공간과 무관하게 `query.pages`를
 * `title` 키로 돌려주므로 이 함수의 이어받기 병합 로직은 그대로 맞는다.
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
      // revisions은 덮어쓴다 — 콘텐츠는 원자적이고, 이어받기 라운드에서는 revisions 키 없이
      // 나타난다. categories와 달리, 이어 붙이면 중복이 되고 revisions[0]만 읽혀서 틀렸다.
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
 *
 * 저자 문서에도 그대로 쓴다 — MediaWiki는 없는 문서를 음수 pageid +
 * `missing: ""`(빈 문자열, `undefined`가 아니다)로 표시하고, `!== undefined`
 * 비교라 빈 문자열도 "있다"로 잡힌다.
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
  // 사유 목록을 손으로 적지 않는다. 사유가 늘어날 때 이 객체가 따라오지
  // 않으면 excluded[reason]++가 undefined + 1이 되어 보고가 NaN이 된다 —
  // .mjs라 타입 검사가 없어 아무도 못 잡는다.
  const excluded = Object.fromEntries(EXCLUSION_REASONS.map((r) => [r, 0]));
  const noAuthorTitles = [];
  // 번역물 중 저자 검사(checkAuthor·eraConsistent)에서 걸려 표에도 담기지
  // 못한 수 — 원저자(해외 저자 등)가 배제된 경우다. 아래 3)에서 채운다.
  let translatedExcludedByAuthor = 0;
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

      // books.source_ref와 **같은 함수**를 거쳐야 두 값이 짝지어진다.
      // 실측으로 지금 329행은 전부 이미 일치하지만(MediaWiki의 title이
      // 이미 정규형이다) 보장이 아니다. seed.mjs가 과거에 정확히 이
      // 버그를 겪었다 — 원문 제목을 source_ref에 넣어 "임포트 경로가
      // 절대 만들지 않을 문자열"을 만들었고 unique 인덱스가 무력해졌다
      // (PRD §11-51). 그 교훈이 이 스크립트에 이어지지 않았다.
      //
      // 제목 하나가 정규화에 실패해도(toPageTitle은 빈 값에 던진다) 동기화
      // 전체를 멈추지 않는다 — 그 작품 하나만 건너뛴다.
      let pageTitle;
      try {
        pageTitle = toPageTitle(title);
      } catch (err) {
        console.error(`  ✗ 제목을 정규화할 수 없다: ${title} — ${err.message}`);
        continue;
      }

      const wikitext =
        revs.get(title)?.revisions?.[0]?.slots?.main?.["*"] ?? "";
      const header = parseHeader(wikitext);

      // 저자를 모르면 권리 검사를 하나도 할 수 없다 — 기계가 아무것도
      // 보증하지 못하는 행을 「가져올 수 있는 목록」에 둘 수 없다.
      // 주소 입력 화면이 그 경로다: 거기서는 사람이 저자를 타이핑하고
      // 금지 명단 검사가 그 입력에 걸린다.
      if (!header.author) {
        excluded["저자 불명"]++;
        noAuthorTitles.push(title);
        continue;
      }

      candidates.push({
        page_title: pageTitle,
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

  // ---- 3) 저자 문서로 권리를 판정한다 (요청 약 4회) ----
  //
  // 이것이 PRD §5.11을 **그대로** 구현하는 지점이다. 그동안은 위키문헌의
  // PD-old-* 태그를 대신 믿었다 — 문서 세 곳에 "그건 우리 기준이 아니다"라고
  // 적어 놓고도. 저자 문서 분류에 사망 연도와 국적이 있어서 우리 기준
  // (1962년 이전 사망)을 직접 적용할 수 있다.
  //
  // 서로 다른 저자마다 한 번만 조회한다 — 작품마다 받으면 김동인 하나를
  // 61번 조회한다.
  console.log(`\n=== 저자 문서로 권리를 판정한다 ===`);

  const authors = [...new Set(candidates.map((c) => c.author))];
  const authorInfo = new Map();

  for (let i = 0; i < authors.length; i += BATCH) {
    const chunk = authors.slice(i, i + BATCH);
    const pages = await fetchProp(
      chunk.map(authorPageTitle),
      "&prop=categories&cllimit=500",
    );
    for (const author of chunk) {
      const page = pages.get(authorPageTitle(author));
      const authorCats = (page?.categories ?? []).map((c) => c.title);
      authorInfo.set(author, parseAuthorPage(authorCats, isMissingFromResponse(page)));
    }
    progress(Math.min(i + BATCH, authors.length), authors.length, `저자 ${authorInfo.size}명`);
  }

  const authorPassed = [];
  const rejectedAuthors = new Map(); // 저자 → { reason, works }

  for (const c of candidates) {
    const verdict = checkAuthor(authorInfo.get(c.author));
    if (verdict.ok) {
      authorPassed.push(c);
      continue;
    }
    excluded[verdict.reason]++;
    if (c.translator) translatedExcludedByAuthor++;
    const seen = rejectedAuthors.get(c.author) ?? { reason: verdict.reason, works: 0 };
    seen.works++;
    rejectedAuthors.set(c.author, seen);
  }

  // `checkAuthor`는 저자 문서가 존재하고 한국인·1962년 이전 사망인지만
  // 본다 — 받아온 문서가 **정말 그 작품의 저자**인지는 아무것도 확인하지
  // 않는다. `authorPageTitle`이 이름의 첫 괄호 앞만 잘라 저자 문서 제목을
  // 만들 뿐이라, 존재하는 다른 사람의 문서를 우연히 물면(예: 위키문헌이
  // 동명이인 구분 괄호로 표기를 바꾸는 경우) 그 문서가 우연히 한국인이고
  // 1962년 이전 사망이기만 하면 그대로 통과해 버린다. 발표 연도가 그
  // 저자의 생애 밖이면 다른 사람의 문서를 짚었다는 신호로 보고 표에서
  // 뺀다 — 경고만 하고 마는 것으로는 긴 로그에 묻혀 아무도 못 본다.
  const registrable = [];
  for (const c of authorPassed) {
    const info = authorInfo.get(c.author);
    if (eraConsistent(c.pub_year, info)) {
      registrable.push({
        ...c,
        // 판정의 근거를 행에 남긴다 — 화면이 렌더 시점에 규칙을 다시
        // 적용할 수 있어야 한다 (§11-66). 남기지 않으면 기준을 바꿔
        // 배포했을 때 화면이 낡은 승인을 계속 내놓는다.
        author_born: info.born,
        author_died: info.died,
        author_is_korean: info.isKorean,
        author_is_north_korean: info.isNorthKorean,
      });
      continue;
    }
    excluded["저자 확인 불가"]++;
    if (c.translator) translatedExcludedByAuthor++;
    console.error(
      `  ⚠ ${c.title} (${c.author}): 발표 ${c.pub_year ?? "?"}년 / 저자 생몰 ` +
        `${info.born ?? "?"}–${info.died ?? "?"}년 — 저자 확인 불가로 제외`,
    );
  }

  // ---- 4) 보고 ----
  console.log(`\n=== 제외 ===`);
  for (const reason of EXCLUSION_REASONS) {
    if (!excluded[reason]) continue;
    console.log(`  ${String(excluded[reason]).padStart(4)}  ${reason}`);
    if (reason === "범위 밖 장르") {
      console.log(
        `        (그중 응답에서 "없는 문서"로 표시된 것 ${missingFromResponse}개 — ` +
          `두 호출 사이 삭제된 것으로 보인다. 나머지 ${excluded[reason] - missingFromResponse}개는 ` +
          `장르로 크롤했는데도 장르가 없다는 뜻이라 parseCategories를 의심해야 한다)`,
      );
    }
  }
  console.log(`  ────────────────`);
  console.log(`  ${String(registrable.length).padStart(4)}  표에 담을 것`);

  if (noAuthorTitles.length) {
    console.log(`\n  저자를 못 읽어 제외: ${noAuthorTitles.length}편`);
    console.log(`    ${noAuthorTitles.join(" · ")}`);
    console.log(`    (어휘를 고친 뒤 기대값은 「모비딕」 1편이다. 늘어났다면`);
    console.log(`     위키문헌이 틀을 바꿨거나 파서가 또 어휘를 놓치고 있다)`);
  }

  if (rejectedAuthors.size) {
    console.log(`\n  저자 사유로 제외한 ${rejectedAuthors.size}명:`);
    [...rejectedAuthors]
      .sort((a, b) => b[1].works - a[1].works)
      .forEach(([author, v]) => {
        console.log(`    ${author.padEnd(24)} ${v.reason.padEnd(16)} ${v.works}편`);
      });
  }

  // 번역물이라도 저자 검사(checkAuthor·eraConsistent)를 통과해 registrable에
  // 남은 것만 "표에 담기고 화면에서 가려진다"고 말할 수 있다 — 원저자가
  // 해외 저자 등으로 배제되면 애초에 표에 오르지 않는다(「전쟁과 평화」/
  // 레프 톨스토이가 그 예다).
  const translatedKept = registrable.filter((c) => c.translator).length;
  console.log(`\n  번역물 ${translatedKept}개 — 표에 남아 목록에서 가려진다`);
  if (translatedExcludedByAuthor) {
    console.log(
      `  (그 밖에 번역물 ${translatedExcludedByAuthor}개는 저자 검사에서 걸려 ` +
        `표에도 담기지 못했다 — 원저자가 해외 저자 등으로 배제된 경우다)`,
    );
  }

  // ---- 5) 기존 행과 비교 ----
  const { data: existing, error: readErr } = await db
    .from("wikisource_works")
    .select("page_title");
  if (readErr) throw new Error(`wikisource_works 조회: ${readErr.message}`);

  const had = new Set(existing.map((r) => r.page_title));
  const nextTitles = new Set(registrable.map((c) => c.page_title));
  const added = registrable.filter((c) => !had.has(c.page_title));
  const removed = [...had].filter((t) => !nextTitles.has(t));

  console.log(`\n=== 변경 ===`);
  console.log(`  신규 ${added.length} · 갱신 ${registrable.length - added.length} · 삭제 ${removed.length}`);
  if (added.length) console.log(`  신규 예: ${added.slice(0, 5).map((c) => c.title).join(", ")}`);
  if (removed.length) console.log(`  삭제 예: ${removed.slice(0, 5).join(", ")}`);

  /**
   * 부분 실패로 표를 비우지 않기 위한 관문.
   *
   * 레이트 리밋 때문에 크롤이 중간에 실패한 적이 실제로 여러 번 있다. 그때
   * 후보가 적게 모이는데, 그걸 그대로 반영하면 "위키문헌에서 사라진 문서"로
   * 오인해 표를 대량 삭제한다. 다음 동기화가 되돌리기는 하지만 그 사이의
   * 목록은 텅 비어 있다.
   *
   * **판정과 보고를 `--dry-run` 이른 반환보다 먼저 한다.** 이 파일 머리말이
   * "--dry-run은 선택이 아니라 전제"라고 적어 놓고도, 정작 실제 동기화를
   * 멈추는 이 관문만은 dry-run이 평가조차 하지 않고 지나갔다 — dry-run이
   * 깨끗해 보여도 그대로 돌리면 여기서 막히는 경우를 dry-run이 미리 보여줄
   * 수 없었던 이유다. 판정 자체는 `dryRun` 여부와 무관하게 항상 계산하고
   * 보고하되, **적용**(throw로 멈추는 것)은 실제로 쓸 때만 한다 — dry-run은
   * 아무것도 막지 않고 무엇이 바뀔지만 보여주는 모드이기 때문이다.
   */
  const guardMessage =
    `후보가 기존 ${had.size}개의 70% 미만(${registrable.length}개)이다. ` +
    `크롤이 중간에 실패했을 가능성이 높다. 의도한 축소라면 --force를 붙인다.`;
  const guardTripped = had.size > 0 && registrable.length < had.size * 0.7 && !force;

  if (guardTripped) {
    console.log(
      `\n! 70% 관문: ${guardMessage}` +
        (dryRun ? " (dry-run이라 지금은 멈추지 않지만, 실제로 돌리면 여기서 멈춘다)" : ""),
    );
  } else if (had.size > 0) {
    const pct = ((registrable.length / had.size) * 100).toFixed(0);
    console.log(`\n· 70% 관문 통과: ${registrable.length}/${had.size} (${pct}%)`);
  }

  if (dryRun) {
    console.log(`\n· --dry-run이라 아무것도 쓰지 않았다.`);
    return;
  }

  if (guardTripped) {
    throw new Error(`${guardMessage} 멈춘다.`);
  }

  // ---- 6) upsert + 사라진 행 삭제 ----
  const { error: upErr } = await db
    .from("wikisource_works")
    .upsert(registrable, { onConflict: "page_title" });
  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  if (removed.length) {
    const { error: delErr } = await db
      .from("wikisource_works")
      .delete()
      .in("page_title", removed);
    if (delErr) throw new Error(`삭제: ${delErr.message}`);
  }

  console.log(`\n✓ ${registrable.length}개 반영 완료 (삭제 ${removed.length})`);
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
