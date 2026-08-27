"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { CARD_REGISTRY } from "@/components/cards/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseYoutubeId } from "@/lib/youtube";

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

/**
 * 영상 게시물 저장 (PRD §5.3).
 *
 * mp4 업로드와 유튜브 임베드를 병행한다. 업로드는 videos 공개 버킷으로
 * 가고, 유튜브는 주소에서 ID만 뽑아 저장한다.
 */
export async function saveVideoPost(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const channelId = String(formData.get("channel_id") ?? "");
  const bookId = String(formData.get("book_id") ?? "");
  const sourceType = String(formData.get("source_type") ?? "");
  const publish = formData.get("publish") === "1";

  if (!channelId || !bookId) {
    redirect("/admin/posts?error=채널과 도서를 골라야 합니다");
  }
  if (sourceType !== "upload" && sourceType !== "youtube") {
    redirect("/admin/posts?error=영상 소스를 골라야 합니다");
  }

  const db = await createClient();

  const values = {
    channel_id: channelId,
    book_id: bookId,
    type: "video" as const,
    status: publish ? ("published" as const) : ("draft" as const),
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

  // 영상 상세는 post_id가 PK라 upsert로 갈아 끼운다.
  let detail: Record<string, unknown>;

  if (sourceType === "youtube") {
    const youtubeId = parseYoutubeId(String(formData.get("youtube_url") ?? ""));
    if (!youtubeId) {
      redirect("/admin/posts?error=유튜브 주소에서 영상 ID를 찾지 못했습니다");
    }
    detail = {
      post_id: postId,
      source_type: "youtube",
      youtube_id: youtubeId,
      video_path: null,
    };
  } else {
    const file = formData.get("video");
    const existing = String(formData.get("existing_video_path") ?? "");

    let publicUrl = existing;
    if (file instanceof File && file.size > 0) {
      const admin = createAdminClient();
      const path = `${postId}.mp4`;
      const { error } = await admin.storage
        .from("videos")
        .upload(path, file, { contentType: file.type || "video/mp4", upsert: true });
      if (error) {
        redirect(`/admin/posts?error=영상 업로드 실패: ${encodeURIComponent(error.message)}`);
      }
      publicUrl = admin.storage.from("videos").getPublicUrl(path).data.publicUrl;
    }

    if (!publicUrl) {
      redirect("/admin/posts?error=mp4 파일을 올려야 합니다");
    }
    detail = {
      post_id: postId,
      source_type: "upload",
      video_path: publicUrl,
      youtube_id: null,
    };
  }

  const { error: detailErr } = await db.from("post_videos").upsert(detail);
  if (detailErr) {
    redirect(`/admin/posts?error=${encodeURIComponent(detailErr.message)}`);
  }

  revalidatePath("/admin/posts");
  revalidatePath("/");
  redirect("/admin/posts?saved=1");
}
