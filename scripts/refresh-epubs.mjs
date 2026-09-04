/**
 * 위키문헌 수급 도서의 EPUB을 다시 받아 교체한다.
 *
 *   node --env-file=.env scripts/refresh-epubs.mjs            (전체)
 *   node --env-file=.env scripts/refresh-epubs.mjs 진달래꽃 날개  (제목으로 골라서)
 *   node --env-file=.env scripts/refresh-epubs.mjs --dry-run   (받아서 검사만, 업로드 안 함)
 *
 * 왜 필요한가: 본문은 `src/lib/wikisource.ts`를 거쳐 들어온다 — 폰트를 걷어내고
 * 위키문헌 껍데기(표지·기여자 목록·라이선스 상자)를 떼어낸다. 그 파이프라인이
 * 바뀌면 **이미 올라간 파일은 옛 상태로 남는다**. seed.mjs는 스토리지에 파일이
 * 있으면 재사용하고 넘어가므로 시드를 다시 돌려도 갱신되지 않는다.
 *
 * service role 키를 쓰므로 RLS를 우회한다.
 */

import { createClient } from "@supabase/supabase-js";
// 수급·정리·검사의 원천은 src/lib/wikisource.ts 하나다 (Task 3 개정 참고).
import { assertClean, fetchEpub } from "../src/lib/wikisource.ts";

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

async function run() {
  const { data: books, error } = await db
    .from("books")
    .select("id, title, source, source_ref, epub_path")
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
    // 문서 제목은 DB가 안다 (books.source_ref) — 하드코딩 대응표가 있던 자리다.
    const page = book.source_ref ?? book.title;

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
