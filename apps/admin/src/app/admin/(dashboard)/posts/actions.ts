"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { POST_TEMPLATES, REGION_SCHEMA } from "@ttokttok/shared/cards";
import { parseYoutubeId } from "@ttokttok/shared/youtube";
import { removeUploaded } from "@/lib/admin-storage";
import { preparePostBackground, backgroundFile } from "@/lib/post-background";
import { pathFromPublicUrl } from "@ttokttok/shared/storage-path";

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
    const entry = REGION_SCHEMA[key];
    if (!entry) continue;

    // 폼이 모르는 variant가 오면 defaultVariant로 강제한다 — 렌더러의
    // 폴백과 같은 규칙을 저장 시점에 먼저 적용해 데이터를 깨끗하게 둔다.
    const raw = String(formData.get(`region-${key}-variant`) ?? "");
    const value: { variant: string; text?: string } = {
      variant: raw in entry.variants ? raw : entry.defaultVariant,
    };

    if (entry.input) {
      // 개행을 LF로 통일한 뒤 센다. 브라우저에서는 무동작이다 — Chromium은
      // textarea의 API value 단계에서 이미 CR을 벗겨내고 FormData도 같은
      // 값을 내므로, 편집기 카운터와 서버가 같은 수를 센다(실측 확인).
      //
      // 남겨두는 이유는 브라우저가 아닌 클라이언트다. 이 서버 액션은 임의의
      // formData를 받으므로 스크립트가 CRLF를 직접 보낼 수 있고, 그러면
      // 개행 하나가 두 글자로 세어져 편집기에서 통과할 문구가 거부된다.
      // 서버가 신뢰 경계이므로 여기서 단위를 고정한다.
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

  const { data: previous, error: previousError } = id
    ? await db.from("post_cards").select("background").eq("post_id", id).maybeSingle()
    : { data: null, error: null };
  if (previousError) redirect(`/admin/posts?error=${encodeURIComponent(previousError.message)}`);
  const newPostId = id || crypto.randomUUID();
  let prepared: Awaited<ReturnType<typeof preparePostBackground>>;
  try {
    prepared = await preparePostBackground(formData, previous?.background, newPostId);
  } catch (error) {
    redirect(`/admin/posts?error=${encodeURIComponent(error instanceof Error ? error.message : "배경 저장에 실패했습니다.")}`);
  }

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
    if (error) {
      await removeUploaded(prepared.uploaded ? [prepared.uploaded] : []);
      redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    const { data, error } = await db
      .from("posts")
      .insert({ id: newPostId, ...values })
      .select("id")
      .single();
    if (error) {
      await removeUploaded(prepared.uploaded ? [prepared.uploaded] : []);
      redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);
    }
    postId = data!.id;
  }

  // 카드 한 장은 post_id가 PK인 1:1 상세 행 — upsert 하나로 끝난다.
  const { error: cardErr } = await db.from("post_cards").upsert({
    post_id: postId,
    template: layout.template,
    regions: layout.regions,
    background: prepared.background,
  });

  if (cardErr) {
    // 카드 없는 게시물이 남으면 피드에 빈 화면이 뜬다 — 방금 만든 건 되돌린다.
    if (!id) await db.from("posts").delete().eq("id", postId);
    await removeUploaded(prepared.uploaded ? [prepared.uploaded] : []);
    redirect(`/admin/posts?error=${encodeURIComponent(cardErr.message)}`);
  }

  const oldFile = backgroundFile(previous?.background, postId);
  const currentFile = backgroundFile(prepared.background, postId);
  if (oldFile && oldFile.path !== currentFile?.path) await removeUploaded([oldFile]);
  revalidatePath("/admin/posts");
  redirect("/admin/posts?saved=1");
}

export async function deletePost(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const db = await createClient();

  // post_videos는 post_id에 on delete cascade가 걸려 있어 게시물과 함께
  // 사라진다 — 파일 경로를 지금 읽어 두지 않으면 알 방법이 없다.
  const { data: video } = await db
    .from("post_videos")
    .select("source_type, video_path, asset_group_id")
    .eq("post_id", id)
    .maybeSingle();

  const { data: card, error: backgroundError } = await db.from("post_cards")
    .select("background").eq("post_id", id).maybeSingle();
  if (backgroundError) redirect(`/admin/posts?error=${encodeURIComponent(backgroundError.message)}`);
  const oldBackground = backgroundFile(card?.background, id);

  const { error } = await db.from("posts").delete().eq("id", id);

  if (error) {
    redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);
  }

  // 행이 사라진 뒤에야 파일을 치운다 — 삭제가 실패했는데 파일을 지우면
  // 멀쩡한 게시물의 영상이 사라진다.
  //
  // 유튜브 게시물은 우리 버킷에 파일이 없다. video_path는 이름과 달리
  // 공개 URL이라 경로로 되돌려야 한다 (storage-path.ts).
  const videoPath =
    video?.source_type === "upload" && !video.asset_group_id
      ? pathFromPublicUrl(video.video_path, "videos")
      : null;

  await removeUploaded([
    ...(videoPath ? [{ bucket: "videos", path: videoPath }] : []),
    ...(oldBackground ? [oldBackground] : []),
  ]);

  revalidatePath("/admin/posts");
  redirect("/admin/posts?deleted=1");
}

/**
 * 영상 게시물 저장 (PRD §5.3).
 *
 * 검증된 영상 묶음과 유튜브 임베드를 병행한다. 파일 전송은 Storage에
 * 직접 하고 여기서는 게시물 연결만 원자적으로 저장한다.
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

  const youtubeId = sourceType === "youtube"
    ? parseYoutubeId(String(formData.get("youtube_url") ?? "")) : null;
  if (sourceType === "youtube" && !youtubeId) {
    redirect("/admin/posts?error=유튜브 주소에서 영상 ID를 찾지 못했습니다");
  }
  // Read verified metadata in the transaction, never a hidden URL from the browser.
  const { error } = await db.rpc("save_video_post", {
    // Supabase's generated RPC types omit nullable arguments; SQL accepts NULL for a new post.
    p_id: (id || null) as unknown as string,
    p_channel_id: channelId,
    p_book_id: bookId,
    p_publish: publish,
    p_source: sourceType,
    p_youtube_id: youtubeId ?? undefined,
    p_upload_id: sourceType === "upload" ? String(formData.get("video_upload_id") ?? "") || undefined : undefined,
  });
  if (error) redirect(`/admin/posts?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/posts");
  redirect("/admin/posts?saved=1");
}
