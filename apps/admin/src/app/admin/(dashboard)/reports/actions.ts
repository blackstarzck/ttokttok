"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

/** 신고 처리 + 금칙어 관리 (PRD §5.5 모더레이션). */

async function back(query: string): Promise<never> {
  revalidatePath("/admin/reports");
  redirect(`/admin/reports?${query}`);
}

/** 신고 인용 — 댓글을 soft delete하고 그 댓글의 신고를 전부 처리 완료로. */
export async function deleteReportedComment(formData: FormData) {
  await requireAdmin();

  const commentId = String(formData.get("comment_id") ?? "");
  const db = await createClient();

  const { error } = await db
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) await back(`error=${encodeURIComponent(error.message)}`);

  await db
    .from("reports")
    .update({ status: "deleted" })
    .eq("comment_id", commentId);

  await back("done=deleted");
}

/** 신고 기각 — 댓글은 그대로 두고 신고만 닫는다. */
export async function dismissReport(formData: FormData) {
  await requireAdmin();

  const commentId = String(formData.get("comment_id") ?? "");
  const db = await createClient();

  const { error } = await db
    .from("reports")
    .update({ status: "dismissed" })
    .eq("comment_id", commentId);

  if (error) await back(`error=${encodeURIComponent(error.message)}`);
  await back("done=dismissed");
}

export async function addBannedWord(formData: FormData) {
  await requireAdmin();

  const word = String(formData.get("word") ?? "").trim();
  if (!word) await back("error=단어를 입력하세요");

  const db = await createClient();
  const { error } = await db
    .from("banned_words")
    .upsert({ word }, { onConflict: "word", ignoreDuplicates: true });

  if (error) await back(`error=${encodeURIComponent(error.message)}`);
  await back("done=word_added");
}

export async function removeBannedWord(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const db = await createClient();
  const { error } = await db.from("banned_words").delete().eq("id", id);

  if (error) await back(`error=${encodeURIComponent(error.message)}`);
  await back("done=word_removed");
}
