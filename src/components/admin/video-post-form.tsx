"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveVideoPost } from "@/app/admin/(dashboard)/posts/actions";

export type VideoPostFormValues = {
  id: string;
  channel_id: string;
  book_id: string;
  source_type: "upload" | "youtube";
  video_path: string | null;
  youtube_id: string | null;
};

const selectClass =
  "border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * 영상 게시물 폼 (PRD §5.3).
 * 소스에 따라 입력이 완전히 달라 카드 게시물 폼과 분리했다.
 */
export function VideoPostForm({
  post,
  channels,
  books,
}: {
  post?: VideoPostFormValues;
  channels: { id: string; name: string }[];
  books: { id: string; title: string; author: string }[];
}) {
  const [source, setSource] = useState<"upload" | "youtube">(
    post?.source_type ?? "upload",
  );

  return (
    <form action={saveVideoPost} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={post?.id ?? ""} />
      <input
        type="hidden"
        name="existing_video_path"
        value={post?.video_path ?? ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel_id">채널 *</Label>
          <select
            id="channel_id"
            name="channel_id"
            defaultValue={post?.channel_id ?? ""}
            required
            className={selectClass}
          >
            <option value="" disabled>
              선택하세요
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="book_id">도서 *</Label>
          <select
            id="book_id"
            name="book_id"
            defaultValue={post?.book_id ?? ""}
            required
            className={selectClass}
          >
            <option value="" disabled>
              선택하세요
            </option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="source_type">영상 소스 *</Label>
          <select
            id="source_type"
            name="source_type"
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "upload" | "youtube")
            }
            className={selectClass}
          >
            <option value="upload">mp4 업로드</option>
            <option value="youtube">유튜브</option>
          </select>
        </div>

        {source === "upload" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="video">mp4 파일</Label>
            <Input id="video" name="video" type="file" accept="video/mp4,video/*" />
            <p className="text-muted-foreground text-xs">
              30~60초 세로 영상을 권장합니다. 피드에서 음소거 자동재생·루프로
              나갑니다.
              {post?.video_path ? " 현재: 업로드됨 (다시 올리면 교체)" : ""}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="youtube_url">유튜브 주소 또는 ID</Label>
            <Input
              id="youtube_url"
              name="youtube_url"
              defaultValue={post?.youtube_id ?? ""}
              placeholder="https://youtu.be/... 또는 영상 ID"
            />
            <p className="text-muted-foreground text-xs">
              watch·youtu.be·shorts·embed 주소를 모두 인식합니다. 유튜브는
              iframe이라 재생 제어에 제약이 있습니다.
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="publish" value="1" size="lg" className="min-h-11">
          발행
        </Button>
        <Button
          type="submit"
          name="publish"
          value="0"
          variant="secondary"
          size="lg"
          className="min-h-11"
        >
          임시저장
        </Button>
        <Button asChild variant="ghost" size="lg" className="min-h-11">
          <Link href="/admin/posts">취소</Link>
        </Button>
      </div>
    </form>
  );
}
