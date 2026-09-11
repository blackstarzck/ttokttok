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

test("admin integration: regular readers cannot create content or join admin_accounts", async () => {
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

test("admin integration: channel cover_url round-trips and is publicly readable", async () => {
  const { db } = await account("admin");
  const slug = `cover-${randomUUID().slice(0, 8)}`;
  const coverUrl = "https://example.com/covers/test-cover.png";
  try {
    const { id } = check(
      await db
        .from("channels")
        .insert({ name: "커버 테스트 채널", slug, genre: "소설", cover_url: coverUrl })
        .select("id")
        .single(),
    ).data;
    assert.equal(
      check(await publicDb().from("channels").select("cover_url").eq("id", id).single())
        .data.cover_url,
      coverUrl,
    );
    check(await db.from("channels").update({ cover_url: null }).eq("id", id));
    assert.equal(
      check(await publicDb().from("channels").select("cover_url").eq("id", id).single())
        .data.cover_url,
      null,
    );
  } finally {
    check(await serviceDb().from("channels").delete().eq("slug", slug));
  }
});

test("admin integration: an owner cannot demote or disable their own row", async () => {
  const { db, user } = await account("admin"); // 픽스처의 관리자는 owner다

  // 자기 행 수정은 RLS가 막는다. 없으면 마지막 owner가 스스로를 내려
  // 아무도 관리자를 추가할 수 없는 잠긴 상태를 만들 수 있다.
  assert.equal(
    (
      await db
        .from("admin_accounts")
        .update({ level: "admin" })
        .eq("id", user.id)
        .select()
    ).data?.length,
    0,
  );

  // "disable" 쪽 — 이름이 그렇게 말하는데 지금까지 level만 확인했다. 이
  // 시나리오가 오히려 더 위험하다: 마지막 owner가 스스로를 끄면 demote와
  // 달리 아무도 다시 owner로 승격시킬 관리자가 없는 잠금이 된다.
  assert.equal(
    (
      await db
        .from("admin_accounts")
        .update({ is_active: false })
        .eq("id", user.id)
        .select()
    ).data?.length,
    0,
  );

  const row = check(
    await db
      .from("admin_accounts")
      .select("level, is_active")
      .eq("id", user.id)
      .single(),
  ).data;
  assert.equal(row.level, "owner");
  assert.equal(row.is_active, true);
});

test("admin integration: a non-owner admin cannot write to admin_accounts", async () => {
  const { db, user } = await account("staffAdmin"); // level: "admin", owner 아님
  // admin_accounts.id는 auth.users(id)를 참조한다(마이그레이션
  // 20260911000002:17). 존재하지 않는 무작위 UUID로 insert하면 with check가
  // 통과를 허용하도록 잘못 바뀌어도 외래 키 위반이 나 assert.ok(error)가
  // 그냥 통과해버린다 — 정책 회귀를 못 잡는다. reader는 실재하는
  // auth.users 행이라 외래 키는 항상 통과하고 RLS만 결과를 가른다. 오류
  // 코드(42501 = RLS 위반)까지 단언해 "정책이 막았다"를 못 박는다.
  const { user: reader } = await account("user");

  // insert: with check가 새 행을 검사한다. owner가 아니므로 정책 위반이다
  // (update의 0행과 다르다 — 아래 참고).
  const insertResult = await db.from("admin_accounts").insert({
    id: reader.id,
    name: "무단 추가",
    level: "admin",
  });
  assert.equal(insertResult.error?.code, "42501");

  // update: using이 대상 행을 먼저 거른다. owner가 아니므로 어떤 행도
  // 대상에 들지 못해 0행 — 자기 행을 못 바꾸는 owner 테스트와 같은 이유다.
  assert.equal(
    (
      await db
        .from("admin_accounts")
        .update({ level: "owner" })
        .eq("id", user.id)
        .select()
    ).data?.length,
    0,
  );

  // 판정이 실제로 안 바뀌었는지 DB에서 다시 확인한다.
  assert.equal(
    check(
      await db.from("admin_accounts").select("level").eq("id", user.id).single(),
    ).data.level,
    "admin",
  );
});

test("admin integration: is_active=false blocks writes on the same already-issued session", async () => {
  // 세션은 여기서 한 번만 발급받는다 — 이후 재로그인하지 않는다. 비활성화가
  // "다음 로그인부터" 아니라 "지금 가진 세션에서 즉시" 먹는지가 요점이다.
  // (이것이 JWT 클레임 대신 admin_accounts 표 조회를 고른 근거다: 설계 §5,
  // 마이그레이션 20260911000002 주석 — "사고 난 계정을 당장 막는다".)
  const { db, user } = await account("staffAdmin");
  const service = serviceDb();
  const controlSlug = `active-check-${randomUUID().slice(0, 8)}`;

  try {
    // (B)(1) 양성 대조 — 비활성화 **전에** 활성 staffAdmin이 실제로 쓸 수
    // 있다는 것부터 못 박는다. 없으면 "정책이 원래 이 표를 막는다"인 경우
    // 아래 거부 확인이 공허하게 통과한다. 지금 channels_admin_write는
    // is_admin_owner()가 아니라 is_admin()을 써서 실제로 공허하지는 않지만,
    // 정책 한 번 수정에 공허해질 수 있다.
    check(
      await db
        .from("channels")
        .insert({ name: "활성 확인", slug: controlSlug, genre: "소설" }),
    );

    check(
      await service
        .from("admin_accounts")
        .update({ is_active: false })
        .eq("id", user.id),
    );

    // is_admin()이 요청마다 admin_accounts를 다시 읽으므로, 토큰 자체는
    // 여전히 유효해도 다음 쓰기부터 바로 막혀야 한다. admin_accounts가
    // 아니라 is_admin()이 지키는 다른 표(channels)로 확인한다 — is_active
    // 차단이 owner 전용 표만이 아니라 관리자 전체 쓰기를 막는다는 것까지
    // 함께 보인다.
    assert.ok(
      (
        await db.from("channels").insert({
          name: "차단 확인",
          slug: `blocked-${randomUUID().slice(0, 8)}`,
          genre: "소설",
        })
      ).error,
    );
  } finally {
    // 다른 테스트가 이 계정을 다시 쓰므로 활성 상태로 되돌린다. 여기서
    // check()로 던지지 않는다 — try에서 이미 단언이 실패해 예외가 진행
    // 중이면 finally의 새 throw가 그 실패를 가려버린다(JS의 finally
    // 의미론). 복구 실패는 admin-storage.ts의 removeUploaded()와 같은
    // 관용구로 로그만 남긴다.
    const restore = await service
      .from("admin_accounts")
      .update({ is_active: true })
      .eq("id", user.id);
    if (restore.error) {
      console.error(`staffAdmin 활성화 복구 실패: ${restore.error.message}`);
    }
    const cleanup = await service
      .from("channels")
      .delete()
      .eq("slug", controlSlug);
    if (cleanup.error) {
      console.error(
        `양성 대조 채널 정리 실패 (slug=${controlSlug}): ${cleanup.error.message}`,
      );
    }
  }
});
