import { test } from "node:test";
import assert from "node:assert/strict";
import { createServerDatabase } from "@ttokttok/database/server";
import { createServiceDatabase } from "@ttokttok/database/service";
import { account, publicDb, serviceDb, dbUrl, ids, check } from "./fixtures.ts";

test("client integration: request factory reads published content and excludes drafts", async () => {
  const db = createServerDatabase(
    dbUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { getAll: () => [], setAll: () => {} },
  );
  const posts = check(
    await db
      .from("posts")
      .select("id, post_cards(template, regions)")
      .in("id", [ids.post, ids.draft]),
  ).data;
  assert.deepEqual(
    posts?.map((post) => post.id),
    [ids.post],
  );
  assert.equal(posts[0].post_cards?.template, "a");
});

test("client integration: actual ranking RPC has no duplicate IDs across cursor pages", async () => {
  const db = publicDb();
  const first = check(
    await db.rpc("get_feed_v4", {
      p_seed: "monorepo-integration",
      p_limit: 1,
      p_type: "cards",
    }),
  ).data;
  assert.equal(first.length, 1);
  const second = check(
    await db.rpc("get_feed_v4", {
      p_seed: "monorepo-integration",
      p_limit: 5,
      p_type: "cards",
      p_cursor: first[0].cursor_token,
      p_cursor_id: first[0].id,
    }),
  ).data;
  assert.equal(
    new Set([...first, ...second].map((row) => row.id)).size,
    first.length + second.length,
  );
  assert.ok(second.length > 0);
});

test("client integration: own reading record is private and survives a new session", async () => {
  const { db, user } = await account("user");
  check(
    await db
      .from("reading_progress")
      .upsert({
        user_id: user.id,
        book_id: ids.book,
        percent: 37,
        epub_cfi: "epubcfi(/6/2!/4/2/1:0)",
      }),
  );
  assert.equal(
    check(
      await publicDb()
        .from("reading_progress")
        .select("book_id")
        .eq("user_id", user.id),
    ).data.length,
    0,
  );
  const reconnected = await account("user");
  assert.equal(
    check(
      await reconnected.db
        .from("reading_progress")
        .select("percent")
        .eq("book_id", ids.book)
        .single(),
    ).data.percent,
    37,
  );
  const admin = await account("admin");
  const impersonated = await db
    .from("bookmarks")
    .insert({ user_id: admin.user.id, book_id: ids.book });
  assert.ok(impersonated.error, "RLS must reject another user's record");
  check(
    await serviceDb()
      .from("reading_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("book_id", ids.book),
  );
});

test("client integration: private EPUB rejects public download; server factory signs a readable file", async () => {
  const denied = await publicDb()
    .storage.from("epubs")
    .download("tests/walk.epub");
  assert.ok(denied.error);
  const db = createServiceDatabase(
    dbUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const signed = check(
    await db.storage.from("epubs").createSignedUrl("tests/walk.epub", 60),
  ).data;
  const response = await fetch(signed.signedUrl);
  assert.equal(response.status, 200);
  assert.ok((await response.arrayBuffer()).byteLength > 500);
  const page = await fetch(`http://localhost:3000/read/${ids.book}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /storage\/v1\/object\/sign\/epubs/);
});
