"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { POST_TEMPLATES, REGION_REGISTRY } from "@/components/cards/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseYoutubeId } from "@/lib/youtube";

/**
 * 카드 게시물 CRUD (PRD §5.10).
 *
 * 폼 필드 규약: `template`(게시물 템플릿), `region-{키}-variant`,
 * `region-{키}-text`. 영역 구성·순서는 템플릿이 고정하므로(PRD §5.2)
 * 폼에서 순서 정보를 받지 않는다.
 */

function readCardLayout(formData: FormData):
  | { template: string; regions: Record<string, { variant: string; text?: string }> }
  | { error: string } {
  const template = String(formData.get("template") ?? "");
  const tpl = POST_TEMPLATES[template];
  if (!tpl) return { error: "게시물 템플릿을 골라야 합니다" };

  const regions: Record<string, { variant: string; text?: string }> = {};

  for (const key of tpl.regions) {
    const entry = REGION_REGISTRY[key];
    if (!entry) continue;

    // 폼이 모르는 variant가 오면 defaultVariant로 강제한다 — 렌더러의
    // 폴백과 같은 규칙을 저장 시점에 먼저 적용해 데이터를 깨끗하게 둔다.
    const raw = String(formData.get(`region-${key}-variant`) ?? "");
    const value: { variant: string; text?: string } = {
      variant: raw in entry.variants ? raw : entry.defaultVariant,
    };

    if (entry.input) {
      // textarea는 API value(LF)와 제출값(CRLF)이 다르다 — 편집기 카운터는
      // 전자를, 서버는 후자를 본다. 정규화하지 않으면 카운터가 90/90인데
      // 서버는 92자로 세어 거부하고, 사용자는 화면과 모순된 오류를 본다.
      const text = String(formData.get(`region-${key}-text`) ?? "")
        .replace(/\r\n/g, "\n")
        .trim();
      if (text) {
        // 브라우저 maxLength는 formData 위조로 우회된다 — 편집기 제한과
        // 중복이 아니라 다른 신뢰 경계다. trim 이후 값을 재므로 앞뒤
        // 공백만으로 상한을 넘길 수 없다.
        if (entry.maxLength && text.length > entry.maxLength) {
          return {
            error: `${entry.label} 문구는 ${entry.maxLength}자까지 입력할 수 있습니다 (현재 ${text.length}자)`,
          };
        }
        value.text = text;
      } else if (entry.required) {
        return { error: `${entry.label} 문구를 입력해야 합니다` };
      }
    }

    regions[key] = value;
  }

  return { template, regions };
}

/**
 * posts 행에 넣을 값.
 *
 * 발행 시각은 **처음 발행할 때만** 찍는다. 수정할 때마다 갱신하면 오래된
 * 글이 방금 쓴 글이 되어, get_feed_v2의 신선도 가중(7일 이내 1.5배)과
 * 채널 페이지 정렬이 통째로 흔들린다.
 */
async function buildPostValues(
  db: Awaited<ReturnType<typeof createClient>>,
  args: {
    id: string;
    channelId: string;
    bookId: string;
    type: "cards" | "video";
    publish: boolean;
  },
) {
  let publishedAt: string | null = null;
  if (args.id) {
    const { data } = await db
      .from("posts")
      .select("published_at")
      .eq("id", args.id)
      .maybeSingle();
    publishedAt = data?.published_at ?? null;
  }

  return {
    channel_id: args.channelId,
    book_id: args.bookId,
    type: args.type,
    status: args.publish ? ("published" as const) : ("draft" as const),
    ...(args.publish && !publishedAt
      ? { published_at: new Date().toISOString() }
      : {}),
  };
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

  const layout = readCardLayout(formData);
  if ("error" in layout) {
    redirect(`/admin/posts?error=${encodeURIComponent(layout.error)}`);
  }

  const db = await createClient();

  const values = await buildPostValues(db, {
    id,
    channelId,
    bookId,
    type: "cards",
    publish,
  });

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

  // 카드 한 장은 post_id가 PK인 1:1 상세 행 — upsert 하나로 끝난다.
  const { error: cardErr } = await db.from("post_cards").upsert({
    post_id: postId,
    template: layout.template,
    regions: layout.regions,
  });

  if (cardErr) {
    // 카드 없는 게시물이 남으면 피드에 빈 화면이 뜬다 — 방금 만든 건 되돌린다.
    if (!id) await db.from("posts").delete().eq("id", postId);
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

  // 게시물 행보다 영상을 먼저 확정한다. 순서가 반대면 영상 검증이나 업로드가
  // 실패했을 때 post_videos 없는 영상 게시물이 남고, 그건 피드에서 재생기
  // 대신 빈 도서 표지로 나온다 — 관리자는 저장에 실패한 줄 아는데 사용자
  // 화면에는 빈 게시물이 뜬다.
  //
  // 파일 경로에 쓸 id도 여기서 정한다 — 업로드가 행 생성보다 앞서기 때문.
  const postId = id || crypto.randomUUID();

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

  const values = await buildPostValues(db, {
    id,
    channelId,
    bookId,
    type: "video",
    publish,
  });

  const { error } = id
    ? await db.from("posts").update(values).eq("id", postId)
    : await db.from("posts").insert({ id: postId, ...values });
  if (error) redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);

  // 영상 상세는 post_id가 PK라 upsert로 갈아 끼운다.
  const { error: detailErr } = await db.from("post_videos").upsert(detail);
  if (detailErr) {
    // 영상 없는 영상 게시물이 남지 않게 되돌린다.
    if (!id) await db.from("posts").delete().eq("id", postId);
    redirect(`/admin/posts?error=${encodeURIComponent(detailErr.message)}`);
  }

  revalidatePath("/admin/posts");
  revalidatePath("/");
  redirect("/admin/posts?saved=1");
}
