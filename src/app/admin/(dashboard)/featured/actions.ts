"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";

/**
 * 탐색 '오늘의 추천' 큐레이션 (PRD §5.6-2).
 *
 * featured_books는 book_id가 PK라 도서당 한 줄이다. 순서는 sort_order가
 * 정하고, active로 잠시 내렸다 올릴 수 있다.
 */

async function back(query: string): Promise<never> {
  revalidatePath("/admin/featured");
  revalidatePath("/discover");
  redirect(`/admin/featured?${query}`);
}

export async function addFeatured(formData: FormData) {
  await requireAdmin();

  const bookId = String(formData.get("book_id") ?? "");
  if (!bookId) await back("error=도서를 골라야 합니다");

  const db = await createClient();

  // 새 항목은 맨 뒤에 붙인다.
  const { data: last } = await db
    .from("featured_books")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db.from("featured_books").upsert({
    book_id: bookId,
    sort_order: (last?.sort_order ?? -1) + 1,
    active: true,
  });

  if (error) await back(`error=${encodeURIComponent(error.message)}`);
  await back("saved=1");
}

export async function removeFeatured(formData: FormData) {
  await requireAdmin();

  const bookId = String(formData.get("book_id") ?? "");
  const db = await createClient();
  const { error } = await db
    .from("featured_books")
    .delete()
    .eq("book_id", bookId);

  if (error) await back(`error=${encodeURIComponent(error.message)}`);
  await back("removed=1");
}

export async function toggleFeatured(formData: FormData) {
  await requireAdmin();

  const bookId = String(formData.get("book_id") ?? "");
  const active = formData.get("active") === "1";

  const db = await createClient();
  const { error } = await db
    .from("featured_books")
    .update({ active })
    .eq("book_id", bookId);

  if (error) await back(`error=${encodeURIComponent(error.message)}`);
  await back("saved=1");
}

/** 위/아래 이동 — 이웃과 sort_order를 맞바꾼다. */
export async function moveFeatured(formData: FormData) {
  await requireAdmin();

  const bookId = String(formData.get("book_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const db = await createClient();

  const { data: rows, error } = await db
    .from("featured_books")
    .select("book_id, sort_order")
    .order("sort_order");

  if (error || !rows) await back("error=순서를 읽지 못했습니다");

  const index = rows!.findIndex((r) => r.book_id === bookId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows!.length) await back("saved=1");

  const a = rows![index];
  const b = rows![target];

  // 두 행의 순서를 맞바꾼다. 같은 값이 잠시 겹쳐도 PK가 book_id라 문제없다.
  const { error: swapErr } = await db
    .from("featured_books")
    .upsert([
      { book_id: a.book_id, sort_order: b.sort_order },
      { book_id: b.book_id, sort_order: a.sort_order },
    ]);

  if (swapErr) await back(`error=${encodeURIComponent(swapErr.message)}`);
  await back("saved=1");
}
