import { test } from "node:test";
import assert from "node:assert/strict";
import { account, publicDb, serviceDb, ids, check } from "./fixtures.ts";
import { DEFAULT_CARD_BACKGROUND } from "../../packages/shared/src/card-background.ts";
import { preparePostBackground } from "../../apps/admin/src/lib/post-background.ts";

test("background integration: only admin can change a published card background", async () => {
  const admin = await account("admin");
  const reader = await account("user");
  const service = serviceDb();
  const original = check(await service.from("post_cards").select("background").eq("post_id", ids.post).single()).data.background;
  const background = { ...DEFAULT_CARD_BACKGROUND, color: "#274d43", text: "light" };
  try {
    check(await admin.db.from("post_cards").update({ background }).eq("post_id", ids.post));
    await reader.db.from("post_cards").update({ background: null }).eq("post_id", ids.post);
    assert.deepEqual(check(await publicDb().from("post_cards").select("background").eq("post_id", ids.post).single()).data.background, background);
    assert.ok((await admin.db.from("post_cards").update({ background: [] }).eq("post_id", ids.post)).error);
    assert.equal(check(await publicDb().from("post_cards").select("background").eq("post_id", ids.draft)).data.length, 0);
  } finally {
    check(await service.from("post_cards").update({ background: original }).eq("post_id", ids.post));
  }
});

test("background integration: forged URL and corrupted images cannot be saved", async () => {
  const form = new FormData();
  form.set("background", JSON.stringify({ ...DEFAULT_CARD_BACKGROUND, type: "image", imageUrl: "https://example.com/forged.png" }));
  await assert.rejects(preparePostBackground(form, null, ids.post), /첨부/);
  form.set("background-image", new File(["not an image"], "fake.png", { type: "image/png" }));
  await assert.rejects(preparePostBackground(form, null, ids.post), /읽을 수 없습니다/);
});
