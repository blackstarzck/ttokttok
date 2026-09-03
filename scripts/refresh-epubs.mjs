/**
 * 위키문헌 수급 도서의 EPUB을 다시 받아 교체한다.
 *
 *   node --env-file=.env scripts/refresh-epubs.mjs            (전체)
 *   node --env-file=.env scripts/refresh-epubs.mjs 진달래꽃 날개  (제목으로 골라서)
 *   node --env-file=.env scripts/refresh-epubs.mjs --dry-run   (받아서 검사만, 업로드 안 함)
 *
 * 왜 필요한가: 본문은 `lib/wikisource.mjs`를 거쳐 들어온다 — 폰트를 걷어내고
 * 위키문헌 껍데기(표지·기여자 목록·라이선스 상자)를 떼어낸다. 그 파이프라인이
 * 바뀌면 **이미 올라간 파일은 옛 상태로 남는다**. seed.mjs는 스토리지에 파일이
 * 있으면 재사용하고 넘어가므로 시드를 다시 돌려도 갱신되지 않는다.
 *
 * service role 키를 쓰므로 RLS를 우회한다.
 */

import { createClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";
import { fetchEpub } from "./lib/wikisource.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.\n" +
      "실행: node --env-file=.env scripts/refresh-epubs.mjs",
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * 도서 제목 ≠ 위키문헌 문서 제목인 경우의 대응표.
 *
 * 대개는 제목이 그대로 문서 제목이지만, 동명 문서가 있으면 위키문헌 쪽에
 * 괄호가 붙는다. DB에는 문서 제목을 담을 칸이 없어서(§6 books) 여기 적는다 —
 * 새 책을 넣었는데 "문서를 찾을 수 없다"가 뜨면 이 표에 한 줄 추가할 것.
 */
const PAGE_OVERRIDES = {
  "하늘과 바람과 별과 시": "하늘과 바람과 별과 시 (1948년)",
  진달래꽃: "진달래꽃 (시집)",
};

/**
 * 업로드 직전 관문.
 *
 * 수급 파이프라인이 제 일을 했는지 올리기 전에 확인한다 — 껍데기가 남은 파일이
 * 조용히 올라가면 뷰어를 열어 보기 전까지 아무도 모른다. 정규식으로 XML을
 * 주무르는 처리라 위키문헌이 마크업을 바꾸면 언제든 헛돌 수 있다.
 */
function assertClean(epub) {
  const entries = unzipSync(new Uint8Array(epub));
  const paths = Object.keys(entries);
  const body = paths
    .filter((p) => /\.xhtml$/i.test(p))
    .map((p) => strFromU8(entries[p]))
    .join("");

  const problems = [];
  if (paths[0] !== "mimetype") problems.push("mimetype이 첫 항목이 아님");
  if (paths.some((p) => /(^|\/)title\.xhtml$/i.test(p))) problems.push("title.xhtml");
  if (paths.some((p) => /(^|\/)about\.xhtml$/i.test(p))) problems.push("about.xhtml");
  if (paths.some((p) => /Wikisource-logo/i.test(p))) problems.push("위키문헌 로고");
  if (/licenseContainer/i.test(body)) problems.push("라이선스 상자");

  const chapters = paths.filter((p) => /\/c\d+_.*\.xhtml$/i.test(p)).length;
  if (chapters === 0) problems.push("본문 챕터 없음");

  if (problems.length > 0) {
    throw new Error(`검사 실패 — ${problems.join(", ")}`);
  }
  return chapters;
}

async function run() {
  const { data: books, error } = await db
    .from("books")
    .select("id, title, source, epub_path")
    .eq("source", "wikisource")
    .not("epub_path", "is", null)
    .order("title");

  if (error) throw new Error(`books 조회: ${error.message}`);

  const targets = only.length
    ? books.filter((b) => only.some((q) => b.title.includes(q)))
    : books;

  if (!targets?.length) {
    console.log(
      only.length
        ? `"${only.join(", ")}"에 해당하는 위키문헌 도서가 없다.`
        : "위키문헌에서 수급한 도서가 없다.",
    );
    return;
  }

  if (dryRun) console.log("· --dry-run — 받아서 검사만 하고 업로드하지 않는다.\n");

  let ok = 0;
  const failed = [];

  for (const book of targets) {
    const page = PAGE_OVERRIDES[book.title] ?? book.title;

    try {
      const epub = await fetchEpub(page);
      const chapters = assertClean(epub);
      const sizeKb = Math.round(epub.length / 1024);

      if (dryRun) {
        console.log(`· ${book.title} — ${sizeKb}KB, 챕터 ${chapters}개 (검사 통과)`);
        ok++;
        continue;
      }

      const { error: upErr } = await db.storage
        .from("epubs")
        .upload(book.epub_path, epub, {
          contentType: "application/epub+zip",
          upsert: true,
        });
      if (upErr) throw new Error(`업로드: ${upErr.message}`);

      const { error: dbErr } = await db
        .from("books")
        .update({
          file_size_mb: Math.round((epub.length / 1024 / 1024) * 100) / 100,
        })
        .eq("id", book.id);
      if (dbErr) throw new Error(`file_size_mb 갱신: ${dbErr.message}`);

      console.log(`✓ ${book.title} — ${sizeKb}KB, 챕터 ${chapters}개`);
      ok++;
    } catch (err) {
      // 한 권이 실패해도 나머지는 계속한다 — 문서 제목이 바뀐 책 하나 때문에
      // 전체 갱신이 멈추면 곤란하다.
      console.error(`✗ ${book.title} (문서: ${page}) — ${err.message}`);
      failed.push(book.title);
    }
  }

  console.log(
    `\n${dryRun ? "검사" : "교체"} ${ok}권` +
      (failed.length ? `, 실패 ${failed.length}권: ${failed.join(", ")}` : ""),
  );
  if (failed.length) process.exitCode = 1;
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
