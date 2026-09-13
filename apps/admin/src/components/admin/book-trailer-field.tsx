"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import { youtubeThumbnailUrl } from "@ttokttok/shared/youtube";
import { VideoBundleField } from "@/components/admin/video-bundle-field";

export type BookTrailerValues = {
  source_type: "upload" | "youtube";
  youtube_id: string | null;
  poster_path: string | null;
  duration_sec: number | null;
  renditions: unknown;
};

type Source = "none" | "youtube" | "upload";

const selectClass =
  "border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * 도서 폼의 트레일러 섹션 (설계 §6.1). 도서당 하나. 「없음」으로 저장하면 제거다.
 *
 * 저장 버튼은 서버 컴포넌트(BookForm)에 있어 이 상태를 넘겨받지 못한다. 그래서
 * 업로드가 끝나기 전의 제출은 여기서 가장 가까운 form의 submit을 가로채 막고,
 * 서버 검증(saveBook)이 최종 방어선이다.
 */
export function BookTrailerField({ trailer }: { trailer: BookTrailerValues | null }) {
  const [source, setSource] = useState<Source>(trailer?.source_type ?? "none");
  const [videoReady, setVideoReady] = useState(trailer?.source_type === "upload");
  const [blocked, setBlocked] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ source, videoReady });
  state.current = { source, videoReady };

  useEffect(() => {
    const form = host.current?.closest("form");
    if (!form) return;
    const guard = (event: Event) => {
      if (state.current.source === "upload" && !state.current.videoReady) {
        event.preventDefault();
        setBlocked(true);
        host.current?.scrollIntoView({ block: "center" });
      }
    };
    form.addEventListener("submit", guard);
    return () => form.removeEventListener("submit", guard);
  }, []);

  const labels = Array.isArray(trailer?.renditions)
    ? (trailer.renditions as { label?: string }[]).map((r) => r.label).filter(Boolean).join(" · ")
    : "";

  return (
    <div ref={host} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="trailer_source">트레일러 소스</Label>
        <select
          id="trailer_source"
          name="trailer_source"
          value={source}
          onChange={(e) => {
            const next = e.target.value as Source;
            setSource(next);
            setBlocked(false);
            setVideoReady(next === "upload" && trailer?.source_type === "upload");
          }}
          className={selectClass}
        >
          <option value="none">없음</option>
          <option value="youtube">유튜브</option>
          <option value="upload">영상 파일</option>
        </select>
      </div>

      {source === "youtube" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="trailer_youtube_url">유튜브 주소 또는 ID</Label>
          <Input
            id="trailer_youtube_url"
            name="trailer_youtube_url"
            defaultValue={trailer?.youtube_id ?? ""}
            placeholder="https://youtu.be/... 또는 영상 ID"
          />
          <p className="text-muted-foreground text-xs">watch·youtu.be·shorts·embed 주소를 모두 인식합니다.</p>
          {trailer?.youtube_id ? (
            <Image
              unoptimized
              src={youtubeThumbnailUrl(trailer.youtube_id)}
              alt="트레일러 썸네일"
              width={160}
              height={120}
              className="w-40 rounded-md object-cover"
            />
          ) : null}
        </div>
      ) : null}

      {source === "upload" ? (
        <div className="flex flex-col gap-3">
          {trailer?.source_type === "upload" && trailer.poster_path ? (
            <div className="flex items-center gap-3">
              <Image
                unoptimized
                src={trailer.poster_path}
                alt="현재 트레일러 첫 화면"
                width={96}
                height={171}
                className="w-24 rounded-md object-cover"
              />
              <p className="text-muted-foreground text-xs">현재 영상 · {labels}{trailer.duration_sec ? ` · ${trailer.duration_sec}초` : ""}</p>
            </div>
          ) : null}
          <VideoBundleField
            existing={trailer?.source_type === "upload"}
            onReadyChange={(ready) => { setVideoReady(ready); if (ready) setBlocked(false); }}
          />
        </div>
      ) : null}

      {blocked ? (
        <p role="alert" className="text-destructive text-sm">영상 업로드를 먼저 완료하세요</p>
      ) : null}
    </div>
  );
}
