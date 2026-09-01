"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookSelect, type BookOption } from "@/components/admin/book-select";
import {
  PostPreview,
  type PreviewChannel,
} from "@/components/admin/post-preview";
import {
  POST_TEMPLATES,
  REGION_REGISTRY,
} from "@/components/cards/registry";
import { cn } from "@/lib/utils";
import type { FeedCardLayout } from "@/lib/feed";

const selectClass =
  "border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

/** 영역별 편집 상태. 템플릿과 무관하게 영역 키로 보관한다. */
type RegionState = Record<string, { variant: string; text: string }>;

function initRegions(saved?: FeedCardLayout | null): RegionState {
  return Object.fromEntries(
    Object.entries(REGION_REGISTRY).map(([key, entry]) => {
      const value = saved?.regions?.[key];
      const variant =
        value?.variant && value.variant in entry.variants
          ? value.variant
          : entry.defaultVariant;
      return [key, { variant, text: value?.text ?? "" }];
    }),
  );
}

/**
 * 카드 게시물 편집기 — 좌측 입력, 우측 실시간 미리보기 (PRD §5.10).
 *
 * 게시물 템플릿이 영역 구성·순서를 고정하고(PRD §5.2), 관리자는 영역별
 * UI 유형과 텍스트만 고른다. 영역 값은 영역 키로 저장하므로 템플릿을
 * 바꿔도 입력값이 살아남는다.
 *
 * 상태를 여기서 갖는 이유는 하나다: 편집기와 미리보기가 **같은 값**을
 * 봐야 한다. 제출은 여전히 폼 필드가 한다 — 서버 액션은
 * `template`, `region-{키}-variant`, `region-{키}-text` 규약만 읽는다.
 */
export function PostEditor({
  post,
  channels,
  books,
}: {
  post?: {
    id: string;
    channel_id: string;
    book_id: string;
    card: FeedCardLayout | null;
  };
  channels: PreviewChannel[];
  books: BookOption[];
}) {
  const [channelId, setChannelId] = useState(post?.channel_id ?? "");
  const [bookId, setBookId] = useState(post?.book_id ?? "");
  const [template, setTemplate] = useState(() =>
    post?.card && post.card.template in POST_TEMPLATES ? post.card.template : "a",
  );
  const [regions, setRegions] = useState<RegionState>(() =>
    initRegions(post?.card),
  );

  function setRegion(key: string, patch: Partial<{ variant: string; text: string }>) {
    setRegions((rs) => ({ ...rs, [key]: { ...rs[key], ...patch } }));
  }

  const channel = channels.find((c) => c.id === channelId) ?? null;
  const regionKeys = POST_TEMPLATES[template]?.regions ?? [];

  /** 미리보기에 넘길 레이아웃 — 저장될 것과 같은 모양. */
  const layout: FeedCardLayout = {
    template,
    regions: Object.fromEntries(
      regionKeys.map((key) => [
        key,
        { variant: regions[key]?.variant, text: regions[key]?.text },
      ]),
    ),
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="channel_id">채널 *</Label>
            <select
              id="channel_id"
              name="channel_id"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
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

          <BookSelect
            books={books}
            defaultValue={post?.book_id}
            currentBookId={post?.book_id ?? null}
            onValueChange={setBookId}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="template">게시물 템플릿 *</Label>
          <select
            id="template"
            name="template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className={selectClass}
          >
            {Object.entries(POST_TEMPLATES).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label} ({key})
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            영역 구성과 순서는 템플릿이 정합니다. 각 영역의 모양은 아래에서
            고르세요.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">영역</h2>

          {regionKeys.map((key, i) => {
            const entry = REGION_REGISTRY[key];
            if (!entry) return null;
            const value = regions[key];

            return (
              <fieldset
                key={key}
                className="border-border flex flex-col gap-3 rounded-lg border p-4"
              >
                <legend className="text-muted-foreground px-1 text-xs">
                  {i + 1}. {entry.label}
                </legend>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`region-${key}-variant`}>UI 유형</Label>
                  <select
                    id={`region-${key}-variant`}
                    name={`region-${key}-variant`}
                    value={value.variant}
                    onChange={(e) => setRegion(key, { variant: e.target.value })}
                    className={selectClass}
                  >
                    {Object.entries(entry.variants).map(([vk, v]) => (
                      <option key={vk} value={vk}>
                        {v.label} ({key}-template-{vk})
                      </option>
                    ))}
                  </select>
                </div>

                {entry.input ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`region-${key}-text`}>
                      문구{entry.required ? " *" : ""}
                    </Label>
                    {entry.input === "textarea" ? (
                      <Textarea
                        id={`region-${key}-text`}
                        name={`region-${key}-text`}
                        rows={3}
                        value={value.text}
                        required={entry.required}
                        maxLength={entry.maxLength}
                        onChange={(e) => setRegion(key, { text: e.target.value })}
                      />
                    ) : (
                      <Input
                        id={`region-${key}-text`}
                        name={`region-${key}-text`}
                        value={value.text}
                        required={entry.required}
                        maxLength={entry.maxLength}
                        onChange={(e) => setRegion(key, { text: e.target.value })}
                      />
                    )}

                    {/* 상한이 있는 영역만 카운터를 둔다. 90%를 넘으면 색으로
                        근접을 알린다 — 카드 본문이 좁아 넘친 텍스트는 스크롤
                        없이 잘리므로, 저장 후에야 알면 늦다. */}
                    {entry.maxLength ? (
                      <p
                        className={cn(
                          "self-end text-xs tabular-nums",
                          value.text.length >= entry.maxLength * 0.9
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {value.text.length}/{entry.maxLength}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    선택한 도서에서 자동으로 채워집니다.
                  </p>
                )}
              </fieldset>
            );
          })}
        </section>
      </div>

      <aside className="flex shrink-0 flex-col gap-2 self-start lg:sticky lg:top-20">
        <h2 className="text-sm font-medium">
          미리보기{" "}
          <span className="text-muted-foreground text-xs font-normal">
            375×812 · 사용자 화면과 같은 컴포넌트
          </span>
        </h2>

        <PostPreview bookId={bookId} channel={channel} layout={layout} />

        <p className="text-muted-foreground max-w-[375px] text-xs break-keep">
          조작할 수 없습니다 — 미리보기에서 누른 좋아요·공유가 실제 집계에
          섞이지 않도록 막아 두었습니다. 인용구·상세 정보는 게시물이 아니라
          도서에 속하며, 하단 도서 바를 탭했을 때 열리는 시트에서 보입니다.
        </p>
      </aside>
    </div>
  );
}
