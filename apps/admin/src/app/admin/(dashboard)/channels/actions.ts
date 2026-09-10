"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

/**
 * 채널 CRUD (PRD §5.9).
 *
 * 모든 액션이 requireAdmin으로 시작한다 — 서버 액션은 미들웨어를 거치지
 * 않을 수 있다. RLS가 최종 방어선이지만, 여기서 막으면 명확한 리다이렉트를
 * 줄 수 있다.
 */

function readForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    genre: String(formData.get("genre") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    avatar_url: String(formData.get("avatar_url") ?? "").trim() || null,
  };
}

export async function saveChannel(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const values = readForm(formData);

  if (!values.name || !values.slug || !values.genre) {
    redirect("/admin/channels?error=required");
  }

  const db = await createClient();
  const { error } = id
    ? await db.from("channels").update(values).eq("id", id)
    : await db.from("channels").insert(values);

  if (error) {
    redirect(`/admin/channels?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/channels");
  redirect("/admin/channels?saved=1");
}

export async function deleteChannel(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const db = await createClient();
  const { error } = await db.from("channels").delete().eq("id", id);

  if (error) {
    // 게시물이 물려 있으면 FK 제약에 걸린다 — 그 사정을 그대로 알려준다.
    redirect(`/admin/channels?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/channels");
  redirect("/admin/channels?deleted=1");
}
