import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  account,
  publicDb,
  serviceDb,
  ids,
  check,
  fixtureEpub,
} from "./fixtures.ts";

test("admin integration: regular readers cannot create content or promote their role", async () => {
  const { db, user } = await account("user");
  assert.ok(
    (
      await db
        .from("channels")
        .insert({ name: "forbidden", slug: "forbidden", genre: "소설" })
    ).error,
  );
  // 관리자 승격 경로가 사라졌는지는 admin_accounts 쓰기로 확인한다.
  assert.ok(
    (
      await db
        .from("admin_accounts")
        .insert({ id: user.id, name: "침입자", level: "owner" })
    ).error,
  );
  const posts = check(
    await db.from("posts").select("id").eq("id", ids.draft),
  ).data;
  assert.equal(posts.length, 0);
});

test("admin integration: admin CRUD is durable and independently visible to client queries", async () => {
  const { db } = await account("admin");
  const id = randomUUID();
  try {
    check(
      await db
        .from("books")
        .insert({
          id,
          title: "연동 확인 도서",
          author: "테스트 작가",
          category: "소설",
          isbn: "9788936434267",
        }),
    );
    assert.equal(
      check(
        await publicDb().from("books").select("title").eq("id", id).single(),
      ).data.title,
      "연동 확인 도서",
    );
    check(
      await db.from("books").update({ title: "수정된 연동 도서" }).eq("id", id),
    );
    assert.equal(
      check(
        await publicDb().from("books").select("title").eq("id", id).single(),
      ).data.title,
      "수정된 연동 도서",
    );
    assert.equal(
      check(await db.from("posts").select("id").eq("id", ids.draft)).data
        .length,
      1,
    );
  } finally {
    check(await db.from("books").delete().eq("id", id));
  }
  assert.equal(
    check(await publicDb().from("books").select("id").eq("id", id)).data.length,
    0,
  );
});

test("admin integration: authenticated upload and cleanup respect storage policies", async () => {
  const admin = await account("admin");
  const reader = await account("user");
  const path = `tests/${randomUUID()}.epub`;
  assert.ok(
    (await reader.db.storage.from("epubs").upload(path, fixtureEpub())).error,
  );
  try {
    check(
      await admin.db.storage
        .from("epubs")
        .upload(path, fixtureEpub(), { contentType: "application/epub+zip" }),
    );
    const listed = check(
      await admin.db.storage.from("epubs").list("tests"),
    ).data;
    // EPUB has intentionally no SELECT policy, even for admin; uploads are verified via service in the app.
    assert.equal(listed.length, 0);
    assert.ok(
      check(await serviceDb().storage.from("epubs").download(path)).data.size >
        0,
    );
  } finally {
    check(await serviceDb().storage.from("epubs").remove([path]));
  }
  assert.ok((await serviceDb().storage.from("epubs").download(path)).error);
});
