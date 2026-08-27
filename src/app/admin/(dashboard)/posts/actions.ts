"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { CARD_REGISTRY } from "@/components/cards/registry";

/**
 * 카드 게시물 CRUD (PRD §5.10).
 *
 * 카드는 폼에서 `card-{index}-template`, `card-{index}-{슬롯키}` 형태로
 * 들어온다. 순서는 index가 정한다 — 저장할 때 카드를 통째로 지우고 다시
 * 넣으므로 id를 관리할 필요가 없다.
 */

function readCards(formData: FormData) {
  const cards: {
    sort_order: number;
    template_category: string;
    body: Record<string, string>;
  }[] = [];

  // 폼에 몇 장이 들어왔는지는 hidden 필드가 알려준다.
  const count = Number(formData.get("cardCount") ?? 0);

  for (let i = 0; i < count; i++) {
    const template = String(formData.get(`card-${i}-template`) ?? "");
    if (!template || !(template in CARD_REGISTRY)) continue;

    const body: Record<string, string> = {};
    for (const slot of CARD_REGISTRY[template].slots) {
      const value = String(formData.get(`card-${i}-${slot.key}`) ?? "").trim();
      if (value) body[slot.key] = value;
    }

    cards.push({
      sort_order: cards.length,
      template_category: template,
      body,
    });
  }

  return cards;
}

export async function savePost(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const channelId = String(formData.get("channel_id") ?? "");
  const bookId = String(formData.get("book_id") ?? "");
  const publish = formData.get("publish") === "1";

  if (!channelId || !bookId) {
    redirect("/admin/posts?error=채널과 도서를 골라야 합니다");
  }

  const cards = readCards(formData);
  if (cards.length === 0) {
    redirect("/admin/posts?error=카드를 한 장 이상 넣어야 합니다");
  }

  const db = await createClient();

  const values = {
    channel_id: channelId,
    book_id: bookId,
    type: "cards" as const,
    status: publish ? ("published" as const) : ("draft" as const),
    // 처음 발행하는 순간의 시각을 남긴다. 이미 발행된 글은 건드리지 않는다.
    ...(publish ? { published_at: new Date().toISOString() } : {}),
  };

  let postId = id;
  if (postId) {
    const { error } = await db.from("posts").update(values).eq("id", postId);
    if (error) redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);
  } else {
    const { data, error } = await db
      .from("posts")
      .insert(values)
      .select("id")
      .single();
    if (error) redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);
    postId = data!.id;
  }

  // 카드는 지우고 다시 넣는다 (post_cards는 post 삭제 시 CASCADE).
  await db.from("post_cards").delete().eq("post_id", postId);
  const { error: cardErr } = await db
    .from("post_cards")
    .insert(cards.map((c) => ({ ...c, post_id: postId })));

  if (cardErr) {
    redirect(`/admin/posts?error=${encodeURIComponent(cardErr.message)}`);
  }

  revalidatePath("/admin/posts");
  revalidatePath("/");
  redirect("/admin/posts?saved=1");
}

export async function deletePost(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const db = await createClient();
  const { error } = await db.from("posts").delete().eq("id", id);

  if (error) {
    redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/posts");
  revalidatePath("/");
  redirect("/admin/posts?deleted=1");
}
