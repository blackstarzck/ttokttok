# 채널 홈 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채널 페이지(`/channel/[slug]`)를 "커버 히어로 + 두 칸 액션 바 + 정방형 게시물 타일 모자이크"로 바꾸고, 카드 게시물 상세(`/p/[postId]`)가 홈 카드(`PostCard`)를 그리게 한다.

**Architecture:** 서버 컴포넌트 `ChannelHero`·`ChannelActions`·`ChannelGrid`·`PostTile`을 `apps/client/src/components/channel/`에 새로 만들고 페이지가 조합한다. 타일이 무엇을 그릴지는 순수 함수 `resolvePostThumbnail`(`packages/shared`)이 정하고 vitest로 고정한다. 커버는 `channels.cover_url`(마이그레이션 + 어드민 URL 입력)이며 없으면 아바타 블러 → `--post-navy`로 폴백한다. 상세 페이지는 게시물 유형으로 갈라 카드면 `PostCard`, 영상이면 기존 `PostItem`을 그린다.

**Tech Stack:** Next.js 16 App Router(RSC 기본), Tailwind v4 시맨틱 토큰, shadcn/ui(Avatar), Supabase(로컬 e2e DB 54421), vitest, Playwright.

**설계 문서:** `docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md` — 각 태스크의 "왜"는 거기 있다.

## Global Constraints

- **작업 트리는 worktree `C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-channel-home`(브랜치 `feat/channel-home-redesign`)이다.** 부모 트리 `…/ttokttok`는 다른 세션 두 개가 동시에 쓰고 있다 — 절대 부모 트리에서 편집·커밋하지 않는다. 아래 모든 경로·명령은 worktree 루트 기준이다.
- 스타일은 시맨틱 토큰만(`bg-background`, `text-muted-foreground`). 원시 hex·px·Tailwind 팔레트 직접 참조 금지. **예외는 두 가지뿐**: 콘텐츠 색 토큰(`var(--post-navy)`, `var(--post-paper)`, `var(--post-ink-light|dark)`)과 히어로·타일 위 흰색 고정 크롬(`text-white`, `bg-black/50`, `border-white/40`) — 후자는 Task 4에서 DESIGN.md 면제 목록에 함께 적는다.
- 서버 컴포넌트가 기본. `"use client"`는 `ChannelShareButton` 하나에만 붙인다.
- 조회 실패를 빈 값으로 삼키지 않는다 — 데이터 함수는 `{ …, failed }`를 돌려준다(FRONTEND.md §5).
- 최소 글자 12px(`text-xs`), 터치 타깃 44×44(`min-h-11`/`size-11`), 인접 타깃 8px(`gap-2`).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 한 줄.
- 완료 기준: `npm run typecheck`·`npm test`·`npm run build` 통과 + Playwright 375px 실제 렌더(라이트·다크).
- **로컬 e2e DB(`ttokttok-e2e`, 포트 54421)는 이미 떠 있고 다른 세션과 공유한다.** 마이그레이션은 `migration up --local`로 **추가만** 한다. `db reset`·`test-db.mjs --stop`을 실행하지 않는다.
- **E2E 실행 전 포트 3000·3001이 비어 있는지 확인한다.** Playwright 설정이 `reuseExistingServer`라, 다른 세션이 부모 트리 서버를 3000에 띄워 두었으면 그 서버(다른 코드)를 검사하게 된다.
- 아래 명령의 `$SCRATCH`는 세션 스크래치패드 `C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-workspace-ttokttok-project-ttokttok/dd8d7565-ae15-4795-9a94-b6f56478bb98/scratchpad`다. 캡처·임시 스크립트는 전부 거기에 둔다 — 저장소에 남기지 않는다.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `supabase/migrations/20260912000001_channel_cover.sql` | `channels.cover_url text` 추가 |
| `packages/database/src/types.ts` | channels Row/Insert/Update에 `cover_url` |
| `apps/client/src/lib/channel.ts` | `getChannel` select에 `cover_url`, 새 `getChannelCounts` |
| `packages/shared/src/post-thumbnail.ts` (+ `.test.ts`) | 타일 결정 순수 함수 `resolvePostThumbnail` |
| `apps/client/src/components/channel/post-tile.tsx` | 타일 하나 (Link + 이미지/단색 + 훅 + 재생 글리프) |
| `apps/client/src/components/channel/channel-grid.tsx` | 3열 모자이크, 렌더 불가 카드 필터, 빈/실패 문구 |
| `apps/client/src/components/channel/channel-share-button.tsx` | `"use client"` 공유 버튼 |
| `apps/client/src/components/channel/channel-actions.tsx` | 두 칸 액션 바 |
| `apps/client/src/components/channel/channel-hero.tsx` | 커버 + 스크림 + 뒤로가기 + 아바타·이름·메타·소개 + actions 슬롯 |
| `apps/client/src/app/(main)/channel/[slug]/page.tsx` | 조합 |
| `apps/client/src/components/feed/post-card.tsx`, `card-actions.tsx` | `pinnedCommentId` 관통 |
| `apps/client/src/app/(main)/p/[postId]/page.tsx` | 유형 분기: 카드 → 헤더 + `PostCard` |
| `apps/admin/src/app/admin/(dashboard)/channels/page.tsx`, `actions.ts` | 커버 URL 입력·저장 |
| `tests/live-db/fixtures.ts`, `tests/live-db/admin.test.ts` | 시드 커버 이미지, cover_url 왕복 |
| `e2e/client.runtime.spec.ts`, `e2e/admin.runtime.spec.ts`, `e2e/baselines/client/{channel-375,post-375}.png` | 동작·시각 회귀 |
| `docs/prd-ttokttok.md`, `docs/DESIGN.md` | §5.9·§6·§11-68, 면제 목록 |

---

### Task 1: 커버 컬럼 — 마이그레이션 · 타입 · 데이터 계층

**Files:**
- Create: `supabase/migrations/20260912000001_channel_cover.sql`
- Modify: `packages/database/src/types.ts:218-247` (channels)
- Modify: `apps/client/src/lib/channel.ts`
- Modify: `docs/prd-ttokttok.md:365-367` (§6 channels)

**Interfaces:**
- Produces: `getChannel(slug)` → `{ channel: { id, name, slug, genre, description, avatar_url, cover_url } | null, failed }`
- Produces: `getChannelCounts(channelId: string): Promise<{ total: number; videos: number; failed: boolean }>`

- [ ] **Step 1: worktree에 테스트 env를 복사한다**

```bash
cd "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-channel-home"
cp ../ttokttok/.env.test .env.test
grep -c "127.0.0.1:54421" .env.test
```
Expected: `1`

- [ ] **Step 2: 마이그레이션 파일을 만든다**

`supabase/migrations/20260912000001_channel_cover.sql`:
```sql
-- 채널 커버 이미지 — 채널 홈 히어로의 배경 (PRD §5.9).
-- 설계: docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md
-- 아바타(avatar_url)와 같은 방식으로 어드민이 URL을 입력한다. NULL이면 화면이
-- 아바타 블러 → --post-navy 단색 순으로 폴백하므로 NOT NULL을 걸지 않는다.
-- RLS는 channels 공개 read 정책이 이미 있어 바뀌지 않는다.
alter table public.channels add column cover_url text;
```

- [ ] **Step 3: 생성 타입에 컬럼을 더한다**

`packages/database/src/types.ts`의 `channels` 블록 세 곳, 각각 `avatar_url` 줄 바로 아래에 추가:

```ts
        Row: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
```
```ts
        Insert: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
```
```ts
        Update: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
```

(`npm run db:types`로 재생성하지 않는 이유: 공유 e2e DB에 다른 세션의 스키마가 섞여 있을 수 있어 무관한 diff가 난다. 머지 시점에 한 번 재생성한다.)

- [ ] **Step 4: `lib/channel.ts`를 고친다**

`apps/client/src/lib/channel.ts` 전체를 아래로 교체:

```ts
import { createClient } from "@/lib/supabase/server";

/**
 * 채널 하나. slug로 찾는다.
 *
 * 채널 페이지(`/channel/[slug]`)와 채널 스코프 릴스 뷰어
 * (`/channel/[slug]/reels`) 둘 다 쓴다 — 슬러그로 채널을 찾는 로직이
 * 두 곳에 복제되지 않도록 여기 하나로 둔다. 뷰어는 `id`·`name`만
 * 쓰지만 select 컬럼 목록은 채널 페이지 것 그대로 둔다(갈라두면 한쪽만
 * 고쳐지는 전례가 있었다 — chrome.ts/card-chrome.ts).
 */
export async function getChannel(slug: string) {
  const db = await createClient();
  const { data, error } = await db
    .from("channels")
    .select("id, name, slug, genre, description, avatar_url, cover_url")
    .eq("slug", slug)
    .maybeSingle();

  // error를 삼키면 조회 실패가 그대로 notFound()로 흘러가, 멀쩡히 있는
  // 채널을 **"없는 채널"이라고 거짓말**한다 — 영상을 누르고 들어온
  // 사용자가 막다른 길에 갇힌다. 화면이 두 경우에 다른 말을 할 수 있도록
  // 나눠 준다 (§11-55의 getFeed·getNotifications와 같은 규약).
  if (error) {
    console.error("getChannel:", error.message);
    return { channel: null, failed: true };
  }
  return { channel: data, failed: false };
}

/**
 * 채널의 발행 게시물 수와 그중 영상 수.
 *
 * 그리드에 실린 목록(`getChannelPosts`, 최대 30건 — §11-58)으로 세면
 * 30건을 넘는 채널에서 "게시물 30"으로 틀리고, 영상이 전부 31번째
 * 뒤에 있으면 "영상 이어보기"가 사라진다. 그래서 head count 두 번을
 * 병렬로 던진다 — 행을 받지 않으니 비용은 카운트 쿼리 두 개다.
 *
 * `failed`면 화면은 "게시물 –"를 그리고 "영상 이어보기"를 숨긴다 —
 * 영상 0건 채널의 뷰어는 `notFound()`로 답하므로, 모르는 채로 링크를
 * 살려두면 막다른 길이 된다 (설계 문서 §1.2).
 */
export async function getChannelCounts(
  channelId: string,
): Promise<{ total: number; videos: number; failed: boolean }> {
  const db = await createClient();
  const published = () =>
    db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .eq("status", "published");

  const [all, videos] = await Promise.all([
    published(),
    published().eq("type", "video"),
  ]);

  const error = all.error ?? videos.error;
  if (error) {
    console.error("getChannelCounts:", error.message);
    return { total: 0, videos: 0, failed: true };
  }
  return { total: all.count ?? 0, videos: videos.count ?? 0, failed: false };
}
```

- [ ] **Step 5: PRD §6 channels 행에 컬럼을 적는다**

`docs/prd-ttokttok.md` 365~366행:
```
channels
  id uuid PK, name text, slug text UNIQUE, avatar_url text,
  genre text, description text, created_at timestamptz
```
→
```
channels
  id uuid PK, name text, slug text UNIQUE, avatar_url text,
  cover_url text,                -- 채널 홈 히어로 배경. NULL이면 아바타 블러 → --post-navy 폴백 (§5.9)
  genre text, description text, created_at timestamptz
```

- [ ] **Step 6: 공유 e2e DB에 마이그레이션을 추가 적용한다**

```bash
cd "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-channel-home"
mkdir -p .tmp/supabase-e2e/supabase
cp ../ttokttok/.tmp/supabase-e2e/supabase/config.toml .tmp/supabase-e2e/supabase/config.toml
rm -rf .tmp/supabase-e2e/supabase/migrations
cp -r supabase/migrations .tmp/supabase-e2e/supabase/migrations
node node_modules/supabase/dist/supabase.js --workdir .tmp/supabase-e2e migration up --local
```
Expected: `Applying migration 20260912000001_channel_cover.sql...` (master에 있는데 아직 안 적용된 다른 마이그레이션이 먼저 적용될 수 있다 — 그것도 정상). "Local database is up to date" 만 나오면 이미 적용된 것.

- [ ] **Step 7: 컬럼이 API로 읽히는지 확인한다**

```bash
node --env-file=.env.test -e "const {createClient}=require('@supabase/supabase-js');const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);db.from('channels').select('slug, cover_url').limit(1).then(r=>{console.log(JSON.stringify(r.error??r.data));process.exit(r.error?1:0)})"
```
Expected: `[{"slug":"test-walk","cover_url":null}]` (또는 빈 배열 `[]`). `42703 column channels.cover_url does not exist`가 나오면 PostgREST 스키마 캐시다 — `docker restart supabase_rest_ttokttok-e2e` 후 10초 뒤 재시도.

- [ ] **Step 8: 타입체크**

```bash
npm run typecheck
```
Expected: 오류 없이 종료 (exit 0).

- [ ] **Step 9: 커밋**

```bash
git add supabase/migrations/20260912000001_channel_cover.sql packages/database/src/types.ts apps/client/src/lib/channel.ts docs/prd-ttokttok.md
git commit -q -F - <<'EOF'
feat(db): add channels.cover_url and channel post counts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: `resolvePostThumbnail` — 타일 결정 순수 함수 (TDD)

**Files:**
- Create: `packages/shared/src/post-thumbnail.ts`
- Test: `packages/shared/src/post-thumbnail.test.ts`

**Interfaces:**
- Consumes: `resolveCardBackground` (`./card-background`), `FeedPost`·`FeedBook`·`FeedCardLayout` (`./feed`)
- Produces:
  ```ts
  export type PostThumbnail =
    | { kind: "image"; src: string; x: number; y: number; dim: number; ink: "light" | "dark"; text: string | null; video: boolean }
    | { kind: "solid"; color: string | null; ink: "light" | "dark"; text: string | null; video: boolean };
  export function resolvePostThumbnail(post: ThumbnailSource): PostThumbnail;
  export type ThumbnailSource = Pick<FeedPost, "type" | "post_cards" | "post_videos"> & { books: Pick<FeedBook, "title" | "cover_url"> };
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/src/post-thumbnail.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolvePostThumbnail, type ThumbnailSource } from "./post-thumbnail";

const book = { title: "테스트 산책", cover_url: null };
const HOOK = "한 문장이 하루를 바꿀 때";

function card(background: unknown, hook: string | null = HOOK): ThumbnailSource {
  return {
    type: "cards",
    books: book,
    post_videos: null,
    post_cards: {
      template: "a",
      regions: { hook: { variant: "a", text: hook } },
      background: background as never,
    },
  };
}

function video(
  v: Partial<NonNullable<ThumbnailSource["post_videos"]>>,
  cover: string | null = null,
): ThumbnailSource {
  return {
    type: "video",
    books: { ...book, cover_url: cover },
    post_cards: null,
    post_videos: {
      source_type: "upload",
      video_path: "https://cdn.test/v/fallback.mp4",
      youtube_id: null,
      duration_sec: 3,
      hls_path: null,
      poster_path: null,
      ...v,
    },
  };
}

describe("resolvePostThumbnail — 카드", () => {
  it("단색 배경은 그 색과 잉크, 훅 문구를 낸다", () => {
    expect(
      resolvePostThumbnail(
        card({ type: "solid", color: "#f2d6c4", imageUrl: null, text: "dark", dim: 40, x: 50, y: 50 }),
      ),
    ).toEqual({ kind: "solid", color: "#f2d6c4", ink: "dark", text: HOOK, video: false });
  });

  it("이미지 배경은 주소·위치·어둡기·잉크를 그대로 넘긴다", () => {
    expect(
      resolvePostThumbnail(
        card({ type: "image", color: null, imageUrl: "https://cdn.test/bg.webp", text: "light", dim: 55, x: 30, y: 70 }),
      ),
    ).toEqual({
      kind: "image",
      src: "https://cdn.test/bg.webp",
      x: 30,
      y: 70,
      dim: 55,
      ink: "light",
      text: HOOK,
      video: false,
    });
  });

  it("배경이 NULL인 옛 게시물은 기본 종이색·어두운 잉크다", () => {
    expect(resolvePostThumbnail(card(null))).toEqual({
      kind: "solid",
      color: null,
      ink: "dark",
      text: HOOK,
      video: false,
    });
  });

  it("이미지형인데 주소가 없으면 CardBackgroundSurface와 같은 단색으로 떨어진다", () => {
    expect(
      resolvePostThumbnail(
        card({ type: "image", color: null, imageUrl: null, text: "light", dim: 40, x: 50, y: 50 }),
      ),
    ).toEqual({ kind: "solid", color: "var(--post-navy)", ink: "light", text: HOOK, video: false });
    expect(
      resolvePostThumbnail(
        card({ type: "image", color: null, imageUrl: null, text: "dark", dim: 40, x: 50, y: 50 }),
      ),
    ).toEqual({ kind: "solid", color: null, ink: "dark", text: HOOK, video: false });
  });

  it("훅이 비어 있으면 text는 null이다", () => {
    expect(resolvePostThumbnail(card(null, "   ")).text).toBeNull();
    expect(resolvePostThumbnail(card(null, null)).text).toBeNull();
  });
});

describe("resolvePostThumbnail — 영상", () => {
  it("유튜브는 i.ytimg.com 썸네일이다", () => {
    expect(
      resolvePostThumbnail(video({ source_type: "youtube", youtube_id: "abcdefghijk", video_path: null })),
    ).toEqual({
      kind: "image",
      src: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      x: 50,
      y: 50,
      dim: 0,
      ink: "light",
      text: null,
      video: true,
    });
  });

  it("업로드는 poster_path를 그대로 쓴다", () => {
    expect(resolvePostThumbnail(video({ poster_path: "https://cdn.test/v/poster.jpg" }))).toMatchObject({
      kind: "image",
      src: "https://cdn.test/v/poster.jpg",
      dim: 0,
      video: true,
      text: null,
    });
  });

  it("포스터 없는 옛 업로드는 도서 표지로 떨어진다", () => {
    expect(resolvePostThumbnail(video({}, "https://cdn.test/cover.jpg"))).toMatchObject({
      kind: "image",
      src: "https://cdn.test/cover.jpg",
      video: true,
    });
  });

  it("포스터도 표지도 없으면 종이색 위에 도서 제목을 쓴다", () => {
    expect(resolvePostThumbnail(video({}))).toEqual({
      kind: "solid",
      color: null,
      ink: "dark",
      text: "테스트 산책",
      video: true,
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run packages/shared/src/post-thumbnail.test.ts
```
Expected: FAIL — `Failed to resolve import "./post-thumbnail"`.

- [ ] **Step 3: 구현한다**

`packages/shared/src/post-thumbnail.ts`:
```ts
import { resolveCardBackground } from "./card-background";
import type { FeedBook, FeedCardLayout, FeedPost } from "./feed";

/**
 * 채널 그리드 타일이 그릴 것 (설계: 2026-09-11-channel-home-redesign §1.3).
 *
 * 화면(`PostTile`)은 이 결과만 보고 그린다 — 어디서 이미지가 오는지
 * (카드 배경·영상 포스터·유튜브·도서 표지)는 여기서 끝난다. 순수 함수라
 * vitest로 여섯 갈래를 고정한다.
 *
 * `video`는 재생 글리프를 그릴지다. 포스터 없는 옛 업로드가 `solid`로
 * 떨어져도 글리프는 남아야 하므로 두 변형이 모두 갖는다.
 */
export type PostThumbnail =
  | {
      kind: "image";
      src: string;
      /** object-position 퍼센트. 카드 배경은 저장값, 그 외는 50/50. */
      x: number;
      y: number;
      /** 어둡기 0~100. 영상·표지는 0 — 위에 글자를 얹지 않는다. */
      dim: number;
      ink: "light" | "dark";
      text: string | null;
      video: boolean;
    }
  | {
      kind: "solid";
      /** CSS 색. null이면 화면이 `var(--post-paper)`를 쓴다. */
      color: string | null;
      ink: "light" | "dark";
      text: string | null;
      video: boolean;
    };

export type ThumbnailSource = Pick<FeedPost, "type" | "post_cards" | "post_videos"> & {
  books: Pick<FeedBook, "title" | "cover_url">;
};

/** 유튜브 기본 썸네일. `next.config.ts` remotePatterns가 `i.ytimg.com/vi/**`를 허용한다. */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

function hookText(layout: FeedCardLayout | null): string | null {
  const text = layout?.regions?.hook?.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

function image(src: string, video: boolean): PostThumbnail {
  return { kind: "image", src, x: 50, y: 50, dim: 0, ink: "light", text: null, video };
}

export function resolvePostThumbnail(post: ThumbnailSource): PostThumbnail {
  if (post.type === "video") {
    const v = post.post_videos;
    if (v?.source_type === "youtube" && v.youtube_id) return image(youtubeThumbnailUrl(v.youtube_id), true);
    if (v?.poster_path) return image(v.poster_path, true);
    if (post.books.cover_url) return image(post.books.cover_url, true);
    return { kind: "solid", color: null, ink: "dark", text: post.books.title, video: true };
  }

  const bg = resolveCardBackground(post.post_cards?.background);
  const text = hookText(post.post_cards);
  if (bg.type === "image" && bg.imageUrl) {
    return { kind: "image", src: bg.imageUrl, x: bg.x, y: bg.y, dim: bg.dim, ink: bg.text, text, video: false };
  }
  // 이미지형인데 주소가 없으면 CardBackgroundSurface와 같은 규칙으로 단색을 고른다
  // — 밝은 잉크는 navy 위에, 어두운 잉크는 종이색 위에.
  const color = bg.type === "image" ? (bg.text === "light" ? "var(--post-navy)" : null) : bg.color;
  return { kind: "solid", color, ink: bg.text, text, video: false };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run packages/shared/src/post-thumbnail.test.ts
```
Expected: `9 passed`.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/post-thumbnail.ts packages/shared/src/post-thumbnail.test.ts
git commit -q -F - <<'EOF'
feat(shared): resolve channel grid thumbnails from post data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: `PostTile` + `ChannelGrid`

**Files:**
- Create: `apps/client/src/components/channel/post-tile.tsx`
- Create: `apps/client/src/components/channel/channel-grid.tsx`

**Interfaces:**
- Consumes: `resolvePostThumbnail` (Task 2), `isRenderableCard` (`@ttokttok/shared/cards`), `FeedPost`
- Produces: `PostTile({ post: FeedPost; href: string })`, `ChannelGrid({ posts: FeedPost[]; slug: string; failed: boolean })`

- [ ] **Step 1: `PostTile`을 쓴다**

`apps/client/src/components/channel/post-tile.tsx`:
```tsx
import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { resolvePostThumbnail } from "@ttokttok/shared/post-thumbnail";
import type { FeedPost } from "@ttokttok/shared/feed";
import type { CSSProperties } from "react";

/**
 * 채널 그리드 타일 하나 (설계 §1.3).
 *
 * 무엇을 그릴지는 `resolvePostThumbnail`이 정했다 — 여기는 그 결과를
 * 정방형에 얹기만 한다. 라운딩이 없는 이유: 타일이 빈틈없이 이어지는
 * 모자이크라서다. 조회수도 없다 — 밑에 글자가 붙으면 모자이크가 깨지고
 * 수치는 상세 액션 줄에서 본다.
 *
 * 이미지 타일의 바탕이 `--post-navy`인 이유: 이미지가 404여도 밝은 잉크의
 * 훅 문구가 읽히도록. 단색 타일은 저장된 색(없으면 종이색)이다.
 *
 * 재생 글리프의 `bg-black/50` 원은 영상 음소거 버튼과 같은 외피다 —
 * 콘텐츠 픽셀 위 흰색 고정 크롬 면제(DESIGN.md Colors).
 */
export function PostTile({ post, href }: { post: FeedPost; href: string }) {
  const thumb = resolvePostThumbnail(post);
  const style = {
    backgroundColor:
      thumb.kind === "solid"
        ? (thumb.color ?? "var(--post-paper)")
        : "var(--post-navy)",
    color: thumb.ink === "light" ? "var(--post-ink-light)" : "var(--post-ink-dark)",
  } satisfies CSSProperties;

  return (
    <Link
      href={href}
      aria-label={`${post.books.title} ${post.type === "video" ? "영상" : "카드"} 게시물`}
      className="focus-visible:ring-ring relative block aspect-square overflow-hidden focus-visible:ring-2 focus-visible:outline-none"
      style={style}
    >
      {thumb.kind === "image" ? (
        <>
          <Image
            src={thumb.src}
            alt=""
            fill
            sizes="(max-width: 480px) 33vw, 160px"
            className="object-cover"
            style={{ objectPosition: `${thumb.x}% ${thumb.y}%` }}
          />
          {thumb.dim > 0 ? (
            <div
              aria-hidden
              className="card-background-dim absolute inset-0"
              style={{ opacity: thumb.dim / 100 }}
            />
          ) : null}
        </>
      ) : null}

      {thumb.text ? (
        <span className="absolute inset-x-0 bottom-0 line-clamp-3 p-2 text-xs leading-snug font-bold break-keep">
          {thumb.text}
        </span>
      ) : null}

      {thumb.video ? (
        <span
          aria-hidden
          className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <Play className="size-4" />
        </span>
      ) : null}
    </Link>
  );
}
```

- [ ] **Step 2: `ChannelGrid`를 쓴다**

`apps/client/src/components/channel/channel-grid.tsx`:
```tsx
import { isRenderableCard } from "@ttokttok/shared/cards";
import type { FeedPost } from "@ttokttok/shared/feed";
import { PostTile } from "@/components/channel/post-tile";

/**
 * 채널 게시물 모자이크 (설계 §1.3, 목적지는 PRD §5.9·§11-58 그대로).
 *
 * 렌더 불가 카드(훅이 빈 카드)는 건너뛴다 — 타일은 보이는데 누르면
 * `/p/[postId]`가 404였다. 필터로 전부 걸러진 경우도 "없어요"다.
 *
 * 실패와 빈 목록은 다른 문구다 (§11-61). 히어로는 이미 떠 있으므로
 * 화면을 통째로 지우지 않고 그리드 자리만 바꾼다.
 */
export function ChannelGrid({
  posts,
  slug,
  failed,
}: {
  posts: FeedPost[];
  slug: string;
  failed: boolean;
}) {
  const visible = posts.filter(
    (post) => post.type === "video" || isRenderableCard(post.post_cards),
  );

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-10 text-center text-sm break-keep">
        {failed
          ? "게시물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          : "아직 발행한 게시물이 없어요."}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-1 pb-4">
      {visible.map((post) => (
        <li key={post.id}>
          <PostTile
            post={post}
            // 영상은 이 채널 안에서 이어 보게 릴스 뷰어로(결정 7), 카드는 상세로.
            href={
              post.type === "video"
                ? `/channel/${slug}/reels?start=${post.id}`
                : `/p/${post.id}`
            }
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 4: 커밋**

```bash
git add apps/client/src/components/channel/post-tile.tsx apps/client/src/components/channel/channel-grid.tsx
git commit -q -F - <<'EOF'
feat(client): square post tiles and channel grid

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: `ChannelHero` · `ChannelActions` · `ChannelShareButton` + DESIGN.md 면제

**Files:**
- Create: `apps/client/src/components/channel/channel-share-button.tsx`
- Create: `apps/client/src/components/channel/channel-actions.tsx`
- Create: `apps/client/src/components/channel/channel-hero.tsx`
- Modify: `docs/DESIGN.md:133` 다음 줄 (Colors 사용 규칙 목록)

**Interfaces:**
- Produces: `ChannelShareButton({ slug, name, className? })`, `ChannelActions({ slug, name, showVideos })`, `ChannelHero({ channel, postCount, actions })` — `channel`은 `{ name, slug, genre, description, avatar_url, cover_url }`

- [ ] **Step 1: 공유 버튼 (클라이언트 leaf)**

`apps/client/src/components/channel/channel-share-button.tsx`:
```tsx
"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 채널 링크 공유. `CardActions.handleShare`와 같은 순서 — Web Share가 있으면
 * 시트, 없으면 클립보드 + 토스트. 카운터는 올리지 않는다(`share_count`는
 * 게시물 단위, 채널에는 대응 컬럼이 없다).
 *
 * 이 파일이 히어로에서 유일한 클라이언트 컴포넌트다 — 나머지는 서버에서
 * 그린다(FRONTEND.md §2).
 */
export function ChannelShareButton({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  async function handleShare() {
    const url = `${window.location.origin}/channel/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크를 복사했어요");
      }
    } catch {
      // 사용자가 공유 시트를 닫았거나 클립보드가 막혔다 — 조용히 둔다.
    }
  }

  return (
    <button type="button" onClick={handleShare} className={className}>
      <Share2 className="size-4" aria-hidden />
      채널 공유
    </button>
  );
}
```

- [ ] **Step 2: 액션 바**

`apps/client/src/components/channel/channel-actions.tsx`:
```tsx
import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@ttokttok/ui/utils";
import { ChannelShareButton } from "@/components/channel/channel-share-button";

/**
 * 히어로 하단의 두 칸 액션 바 (설계 §1.2).
 *
 * 한 필 안에 세로 구분선으로 두 칸을 나눈다 — 참고 화면의 구성이다.
 * 팔로우가 없는 이유: v2 보류(PRD §10). "영상 이어보기"는 채널 릴스
 * 뷰어의 첫 영상으로 간다(`start` 없음).
 *
 * `showVideos`가 false면 왼쪽 칸을 **숨긴다** — 영상 0건 채널에서 그
 * 링크를 살려두면 뷰어가 `notFound()`로 답하는 막다른 길이다. 카운트를
 * 못 읽어 모르는 경우도 같다.
 *
 * 흰색 고정·유리 외피는 커버 사진 위라서다 — 콘텐츠 픽셀 위 크롬 면제
 * (DESIGN.md Colors "채널 히어로 크롬").
 */
const CELL =
  "flex min-h-11 flex-1 items-center justify-center gap-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none";

export function ChannelActions({
  slug,
  name,
  showVideos,
}: {
  slug: string;
  name: string;
  showVideos: boolean;
}) {
  return (
    <div className="flex items-stretch rounded-full border border-white/40 bg-black/30 backdrop-blur-sm">
      {showVideos ? (
        <>
          <Link href={`/channel/${slug}/reels`} className={cn(CELL, "rounded-l-full")}>
            <Play className="size-4" aria-hidden />
            영상 이어보기
          </Link>
          <span aria-hidden className="my-2 w-px bg-white/40" />
        </>
      ) : null}
      <ChannelShareButton
        slug={slug}
        name={name}
        className={cn(CELL, "rounded-r-full", !showVideos && "rounded-l-full")}
      />
    </div>
  );
}
```

- [ ] **Step 3: 히어로**

`apps/client/src/components/channel/channel-hero.tsx`:
```tsx
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@ttokttok/ui/components/avatar";
import type { ReactNode } from "react";

export type ChannelHeroChannel = {
  name: string;
  slug: string;
  genre: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

/**
 * 채널 홈 히어로 (설계 §1.1). 참고 화면의 "커버 사진 위에 뒤로가기·아바타·
 * 이름·액션 바"를 옮긴 것이다.
 *
 * **높이는 `aspect-[3/4]`가 하한이고 내용이 더 길면 자란다.** 배경(이미지·
 * 스크림)은 `absolute inset-0 overflow-hidden` 래퍼 안에 두고 섹션 자체에는
 * overflow를 걸지 않는다 — `overflow: hidden`은 스크롤 컨테이너라 aspect-ratio
 * 상자의 자동 최소 높이가 0이 되어 긴 소개가 잘린다(css-sizing-4 §5.2).
 * 래퍼는 섹션과 함께 자라므로 배경은 항상 꽉 찬다.
 *
 * 배경 세 단계: cover_url → 아바타 블러 → `--post-navy`. 맨 밑 navy는 이미지가
 * 404여도 흰 글자 대비를 지키기 위한 것이다. 스크림은 하단 60%, 검정 0.7에서
 * 투명으로 전 구간 단조 감소 — `post-item.tsx` 하단 스크림과 같은 성격이고
 * 같은 이유로 인라인 스타일이다(v3/v4 그라디언트 클래스 이름 차이).
 *
 * 흰색 고정 크롬은 커버 위라서다 — DESIGN.md Colors "채널 히어로 크롬" 면제.
 * 상단 스크림은 없다 — 뒤로가기가 자기 `bg-black/50` 원을 갖는다(음소거 버튼 선례).
 */
export function ChannelHero({
  channel,
  postCount,
  actions,
}: {
  channel: ChannelHeroChannel;
  /** 이미 포맷된 문자열 — 카운트 실패면 "–". */
  postCount: string;
  actions: ReactNode;
}) {
  const background = channel.cover_url ?? channel.avatar_url;

  return (
    <section className="relative flex aspect-[3/4] flex-col justify-end">
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden"
        style={{ backgroundColor: "var(--post-navy)" }}
      >
        {background ? (
          <Image
            src={background}
            alt=""
            fill
            priority
            sizes="(max-width: 480px) 100vw, 480px"
            className={
              channel.cover_url ? "object-cover" : "scale-110 object-cover blur-2xl"
            }
          />
        ) : null}
        <div
          className="absolute inset-x-0 bottom-0 h-3/5"
          style={{
            background:
              "linear-gradient(to top, rgb(0 0 0 / 0.7) 0%, rgb(0 0 0 / 0.42) 35%, rgb(0 0 0 / 0.22) 60%, rgb(0 0 0 / 0.08) 80%, transparent 100%)",
          }}
        />
      </div>

      <Link
        href="/"
        aria-label="피드로 돌아가기"
        className="absolute top-4 left-4 flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <ChevronLeft aria-hidden />
      </Link>

      <div className="relative flex flex-col gap-3 p-4">
        <Avatar className="size-20 border-2 border-white/80 after:hidden">
          {channel.avatar_url ? <AvatarImage src={channel.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-2xl">{channel.name.slice(0, 1)}</AvatarFallback>
        </Avatar>

        <h1 className="feed-chrome-text text-2xl font-bold text-white break-keep">
          {channel.name}
        </h1>

        <div className="flex items-center gap-2 text-xs text-white/90">
          <span className="rounded-full border border-white/40 px-3 py-1.5 text-white">
            {channel.genre}
          </span>
          <span>게시물 {postCount}</span>
        </div>

        {channel.description ? (
          <p className="feed-chrome-text line-clamp-2 text-sm leading-relaxed text-white/90 break-keep">
            {channel.description}
          </p>
        ) : null}

        {actions}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: DESIGN.md 면제 목록에 히어로·타일을 적는다**

`docs/DESIGN.md`에서 `- **외부 브랜드 자산**도 예외다.`로 시작하는 불릿 **바로 위**에 다음 불릿을 넣는다:

```markdown
- **채널 히어로 크롬과 채널 그리드의 재생 글리프도 같은 면제를 받는다** (2026-09-11, 설계 `docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md`). 채널 홈(`/channel/[slug]`) 상단 히어로는 관리자가 넣은 커버 사진(없으면 아바타 블러)이 깔리므로 밑이 임의의 콘텐츠 픽셀이다 — 그 위의 뒤로가기(`bg-black/50` 원, 음소거 버튼과 같은 외피)·채널명·장르 칩·게시물 수·소개·두 칸 액션 바(`border-white/40 bg-black/30`)는 흰색 고정이고, 하단 60%에 검정 0.7 → 투명 단조 감소 스크림이 대비를 만든다. 이미지가 없거나 깨져도 맨 밑에 `--post-navy` 바탕이 있어 대비가 유지된다. 그리드의 정방형 타일은 카드 배경·영상 포스터 위이므로 영상 타일 우상단 재생 글리프(`bg-black/50` 원 + 흰 아이콘)도 면제다. 타일의 훅 문구는 면제가 아니라 콘텐츠 잉크(`--post-ink-light|dark`, 게시글 배경 절)를 쓴다. 범위는 `apps/client/src/components/channel/` 안으로 한정하고, 그 아래 게시물 상세의 뒤로가기 헤더는 `background` 표면 위라 시맨틱 토큰을 쓴다.
```

- [ ] **Step 5: 타입체크**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/client/src/components/channel/channel-share-button.tsx apps/client/src/components/channel/channel-actions.tsx apps/client/src/components/channel/channel-hero.tsx docs/DESIGN.md
git commit -q -F - <<'EOF'
feat(client): channel hero with cover, scrim and action bar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: 채널 페이지 조합 + PRD §5.9

**Files:**
- Modify: `apps/client/src/app/(main)/channel/[slug]/page.tsx`
- Modify: `docs/prd-ttokttok.md:244-246` (§5.9)

**Interfaces:**
- Consumes: `getChannel`·`getChannelCounts` (Task 1), `getChannelPosts` (`@/lib/feed`), `ChannelHero`·`ChannelActions` (Task 4), `ChannelGrid` (Task 3), `formatCount` (`@ttokttok/shared/format`)

- [ ] **Step 1: 페이지를 교체한다**

`apps/client/src/app/(main)/channel/[slug]/page.tsx` 전체:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatCount } from "@ttokttok/shared/format";
import { ChannelActions } from "@/components/channel/channel-actions";
import { ChannelGrid } from "@/components/channel/channel-grid";
import { ChannelHero } from "@/components/channel/channel-hero";
import { LoadFailed } from "@/components/load-failed";
import { getChannel, getChannelCounts } from "@/lib/channel";
import { getChannelPosts } from "@/lib/feed";

export async function generateMetadata({
  params,
}: PageProps<"/channel/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { channel, failed } = await getChannel(slug);
  // 실패와 없음을 제목에서부터 가른다 — 탭 제목만 봐도 다른 상황이다.
  if (failed) return { title: "채널을 불러오지 못했어요" };
  if (!channel) return { title: "채널을 찾을 수 없어요" };
  return {
    title: channel.name,
    description: channel.description ?? undefined,
    ...(channel.cover_url
      ? { openGraph: { images: [{ url: channel.cover_url }] } }
      : {}),
  };
}

/**
 * 채널 홈 (PRD §5.9, 설계 2026-09-11-channel-home-redesign).
 *
 * 위에서 아래로 히어로(커버·이름·액션 바) → 정방형 타일 모자이크.
 * 타일의 목적지는 유형에 따라 갈린다 — 영상은 채널 스코프 릴스 뷰어
 * (`/channel/[slug]/reels`), 카드는 게시물 상세(`/p/[postId]`, 홈 카드를
 * 그린다)(§11-58·§11-68).
 *
 * 게시물 조회와 카운트는 서로 독립이라 실패도 따로 말한다 — 카운트가
 * 실패했다고 그리드를 지우지 않고, 그리드가 실패했다고 히어로를 지우지
 * 않는다(§11-61).
 */
export default async function ChannelPage({
  params,
}: PageProps<"/channel/[slug]">) {
  const { slug } = await params;
  const { channel, failed: channelFailed } = await getChannel(slug);
  // 조회 실패를 notFound()로 흘려보내면 멀쩡히 있는 채널을 "없는 채널"이라고
  // 거짓말한다 — 영상을 누르고 들어온 사용자가 막다른 길에 갇힌다.
  if (channelFailed) return <LoadFailed />;
  if (!channel) notFound();

  const [{ posts, failed: postsFailed }, counts] = await Promise.all([
    getChannelPosts(channel.id),
    getChannelCounts(channel.id),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <ChannelHero
        channel={channel}
        postCount={counts.failed ? "–" : formatCount(counts.total)}
        actions={
          <ChannelActions
            slug={channel.slug}
            name={channel.name}
            showVideos={!counts.failed && counts.videos > 0}
          />
        }
      />
      <ChannelGrid posts={posts} slug={channel.slug} failed={postsFailed} />
    </div>
  );
}
```

- [ ] **Step 2: PRD §5.9를 고친다**

`docs/prd-ttokttok.md` §5.9의 두 불릿
```
- 채널 = 이름 + 아바타 + 장르 + 소개. 모든 게시물은 채널 명의로 발행.
- 피드/게시물에서 채널 아바타 탭 시 채널 페이지(채널 정보 + 해당 채널 게시물 그리드).
```
→
```
- 채널 = 이름 + 아바타 + **커버 이미지** + 장르 + 소개. 모든 게시물은 채널 명의로 발행. 커버는 어드민이 URL로 넣고(아바타와 같은 방식) 없으면 화면이 아바타 블러 → 단색으로 폴백한다.
- 피드/게시물에서 채널 아바타 탭 시 **채널 홈** — 위에서 아래로 (1) 커버 히어로: 커버 사진 위에 뒤로가기, 아바타, 채널명, 장르 칩 + 게시물 수(발행 전체의 정확한 수), 소개 2줄, 두 칸 액션 바 "영상 이어보기(영상 0건이면 숨김) | 채널 공유", (2) 발행 게시물의 **정방형 3열 타일 모자이크** — 카드는 저장된 배경 + 훅 문구 3줄, 영상은 포스터(업로드)·유튜브 썸네일 + 재생 글리프. 그리드에 조회수는 없다(2026-09-11, 결정 기록 §11-68, 설계 `docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md`).
```

- [ ] **Step 3: 타입체크**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 4: 개발 서버로 375px 렌더를 확인한다**

worktree에서 클라이언트 dev 서버를 **3005**에 띄운다(부모 트리의 3000과 충돌하지 않는 별도 디렉터리·포트). 백그라운드로:
```bash
cd "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-channel-home/apps/client"
node --env-file=../../.env.test ../../node_modules/next/dist/bin/next dev -p 3005
```
Expected 로그: `▲ Next.js 16… - Local: http://localhost:3005`. 그 뒤 어느 트리가 도는지 프로세스로 증명한다(memory: preview-runs-from-parent-repo):
```powershell
$c = Get-NetTCPConnection -LocalPort 3005 -State Listen | Select-Object -First 1
(Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)").CommandLine
```
Expected: 명령줄에 `ttokttok-channel-home`이 들어 있다.

Playwright(npx 캐시 1.63.0, memory: playwright-for-capture-and-verification)로 캡처. 스크래치패드에 `capture.cjs`:
```js
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: process.env.OUT, fullPage: true });
  console.log(JSON.stringify({ errors, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) }));
  await browser.close();
})();
```
```bash
export NODE_PATH="C:/Users/admin/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules"
export PW_EXE=$(ls C:/Users/admin/AppData/Local/ms-playwright/chromium-*/chrome-win*/chrome.exe | sort -V | tail -1)
URL=http://localhost:3005/channel/test-walk OUT="$SCRATCH/channel-375.png" node "$SCRATCH/capture.cjs"
```
Expected: `errors: []`, `scrollWidth: 375`. 이미지를 Read로 열어 히어로(navy 바탕 — 시드에 커버가 아직 없음)·이름·"게시물 3"·액션 바·3열 타일이 보이는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add "apps/client/src/app/(main)/channel/[slug]/page.tsx" docs/prd-ttokttok.md
git commit -q -F - <<'EOF'
feat(client): compose channel home from hero, actions and grid

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: 게시물 상세 — 카드는 홈 카드로 + 댓글 딥링크 관통 + §11-68

**Files:**
- Modify: `apps/client/src/components/feed/card-actions.tsx` (props + CommentSheet)
- Modify: `apps/client/src/components/feed/post-card.tsx` (props 관통)
- Modify: `apps/client/src/app/(main)/p/[postId]/page.tsx` (유형 분기)
- Modify: `docs/prd-ttokttok.md` §11 표 끝 (68행 추가)

**Interfaces:**
- Consumes: `PostCard`, `CARD_SCROLL_ITEM` (`@ttokttok/ui/feed/card-metrics`), `PostItem`
- Produces: `PostCard({ …, pinnedCommentId?: string })`, `CardActions({ …, pinnedCommentId?: string })`

- [ ] **Step 1: `CardActions`에 `pinnedCommentId`를 받는다**

`apps/client/src/components/feed/card-actions.tsx` — props 타입과 구조분해에 추가:
```tsx
export function CardActions({
  post,
  liked,
  isGuest,
  userId,
  pinnedCommentId,
}: {
  post: FeedPost;
  liked: boolean;
  isGuest: boolean;
  userId: string | null;
  /** 알림의 댓글 딥링크(`/p/[postId]?comment=`). 있으면 시트를 열고 그 댓글로 간다. */
  pinnedCommentId?: string;
}) {
```
그리고 `CommentSheet` 호출에 prop을 넘긴다:
```tsx
          <CommentSheet
            postId={post.id}
            currentUserId={userId!}
            pinnedCommentId={pinnedCommentId}
            onAdded={() => setCommentCount((n) => n + 1)}
          >
```

- [ ] **Step 2: `PostCard`가 관통시킨다**

`apps/client/src/components/feed/post-card.tsx`:
```tsx
export function PostCard({
  post,
  liked = false,
  isGuest = true,
  userId = null,
  preview,
  pinnedCommentId,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  preview?: boolean;
  /** 게시물 상세(`/p/[postId]?comment=`)만 넘긴다. 홈은 undefined. */
  pinnedCommentId?: string;
}) {
  return (
    <PostCardView
      post={post}
      preview={preview}
      actions={
        <CardActions
          post={post}
          liked={liked}
          isGuest={isGuest}
          userId={userId}
          pinnedCommentId={pinnedCommentId}
        />
      }
```
(나머지는 그대로.)

- [ ] **Step 3: 상세 페이지를 유형으로 가른다**

`apps/client/src/app/(main)/p/[postId]/page.tsx` — import에 추가:
```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CARD_SCROLL_ITEM } from "@ttokttok/ui/feed/card-metrics";
import { PostCard } from "@/components/feed/post-card";
```
파일 상단 주석 블록(`공유 딥링크 랜딩`) 끝에 한 단락 추가:
```tsx
 *
 * **카드 게시물은 홈 카드(`PostCard`)를 그린다** (§11-68). 홈이 카드 피드가
 * 된 뒤 카드의 정식 모양은 홈 카드다 — 전면 뷰어용 `PostItem`은 홈이 전면
 * 피드였던 시절의 흔적이라, 공유 링크로 들어온 사람이 공유한 사람과 다른
 * 모양을 봤다. 영상은 전면 피드가 정식 모양이므로 `PostItem` 그대로다.
 * 뒤로가기는 그 게시물의 채널 홈으로 고정한다 — 채널 그리드에서 들어온
 * 주 흐름에 맞고, 공유 링크로 들어온 사람에게도 이어 볼 곳이 된다.
 */
```
`PostPage`의 return을 교체:
```tsx
  const props = {
    post,
    liked: likedIds.has(post.id),
    isGuest: user === null,
    userId: user?.id ?? null,
    pinnedCommentId: typeof comment === "string" ? comment : undefined,
  };

  if (post.type === "video") {
    return (
      <div className="h-full">
        <PostItem {...props} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 홈 TopBar와 같은 56px 구조적 헤더. background 표면 위라 시맨틱 토큰. */}
      <header className="border-border bg-background flex h-14 shrink-0 items-center border-b px-2">
        <Link
          href={`/channel/${post.channels.slug}`}
          aria-label="채널로 돌아가기"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden />
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 홈과 같은 하한(min(85%, 720px)) — 홈에서 본 카드와 같은 크기로 보인다. */}
        <div className={CARD_SCROLL_ITEM}>
          <PostCard {...props} />
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 4: PRD §11 결정 기록 68행을 추가한다**

`docs/prd-ttokttok.md` §11 표의 마지막 행(`| 67 | 소개 랜딩을 awesomic.com …`) 바로 아래:
```markdown
| 68 | 채널 홈 재구성 · 카드 상세를 홈 카드로 | 채널 페이지를 "커버 히어로 + 정방형 타일 모자이크"로 바꾸고(2026-09-11, 설계 `docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md`), 카드 타일이 가는 `/p/[postId]`가 전면 뷰어용 `PostItem` 대신 **홈 카드(`PostCard`)** 를 그리게 했다. `PostItem` 렌더는 홈이 전면 피드였던 시절의 흔적이라 공유 링크로 들어온 사람이 공유한 사람과 다른 모양을 봤다. 영상은 `PostItem` 그대로다. 상세의 뒤로가기는 그 게시물의 채널 홈으로 고정한다 — referrer·히스토리 추측 대신 서버 `Link` 하나로 예측 가능하게. 커버는 `channels.cover_url`(어드민 URL 입력)이고 없으면 아바타 블러 → `--post-navy` 순으로 폴백해 흰 글자 대비를 보장한다. 타일은 `resolvePostThumbnail`(순수, vitest)이 정한다 — 카드는 저장된 배경 + 훅 3줄, 영상은 포스터/유튜브 썸네일 + 재생 글리프, 포스터 없는 옛 업로드는 표지 크롭 → 제목. **그리드에서 조회수를 뺐다**(모자이크가 깨진다, 수치는 상세 액션 줄에 있다). 게시물 수·영상 유무는 그리드의 30건 캡이 아니라 head count로 정확히 센다. 액션 바는 "영상 이어보기 \| 채널 공유"이고 팔로우는 v2 보류(§10) 그대로다. 영상 0건·카운트 실패 시 "영상 이어보기"를 숨기는 이유는 채널 릴스 뷰어가 영상 없음을 `notFound()`로 답하기 때문이다. 렌더 불가 카드는 타일을 만들지 않는다 — 전에는 타일이 보이는데 누르면 404였다. 히어로 위 흰색 고정 크롬과 타일 재생 글리프는 피드 크롬 면제(DESIGN.md Colors)에 명시적으로 추가했다 — 근거는 같다, 밑에 깔리는 것이 임의의 콘텐츠 픽셀이다. 범위 밖: 채널 릴스 뷰어의 뒤로가기, 어드민용 "채널 편집" 링크, 커버 업로드(URL 입력만), 그리드 페이지네이션. |
```

- [ ] **Step 5: 타입체크 + 렌더 확인**

```bash
npm run typecheck
```
Expected: exit 0. dev 서버(3005)가 살아 있으면 Task 5 Step 4의 `capture.cjs`로:
```bash
URL="http://localhost:3005/p/33000000-0000-4000-8000-000000000001" OUT="$SCRATCH/post-375.png" node "$SCRATCH/capture.cjs"
```
Expected: `errors: []`. 이미지에 56px 헤더의 뒤로가기, 그 아래 홈 카드(채널 헤더 → 본문 → 액션 줄 → 도서 바)가 보인다.

- [ ] **Step 6: 커밋**

```bash
git add apps/client/src/components/feed/card-actions.tsx apps/client/src/components/feed/post-card.tsx "apps/client/src/app/(main)/p/[postId]/page.tsx" docs/prd-ttokttok.md
git commit -q -F - <<'EOF'
feat(client): render card post detail as the home card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7: 어드민 커버 입력 + 시드 커버 + 실제 DB 테스트

**Files:**
- Modify: `apps/admin/src/app/admin/(dashboard)/channels/page.tsx:31-33, 98-105`
- Modify: `apps/admin/src/app/admin/(dashboard)/channels/actions.ts:17-24`
- Modify: `tests/live-db/fixtures.ts:112-121` (채널 upsert)
- Modify: `tests/live-db/admin.test.ts` (테스트 추가)
- Modify: `e2e/admin.runtime.spec.ts:150-170`

- [ ] **Step 1: 어드민 목록 select와 폼에 커버 URL을 더한다**

`page.tsx` 31~33행의 select:
```ts
    .select("id, name, slug, genre, description, avatar_url, cover_url")
```
아바타 URL 블록(`<Label htmlFor="avatar_url">…</div>`) **바로 아래**에:
```tsx
          <div className="flex flex-col gap-2">
            <Label htmlFor="cover_url">커버 이미지 URL</Label>
            <Input
              id="cover_url"
              name="cover_url"
              defaultValue={editing?.cover_url ?? ""}
              placeholder="채널 홈 상단 배경. 비워 두면 아바타를 흐리게 깔아 표시됩니다"
            />
          </div>
```

- [ ] **Step 2: 저장 액션이 읽는다**

`actions.ts`의 `readForm`에 한 줄:
```ts
    avatar_url: String(formData.get("avatar_url") ?? "").trim() || null,
    cover_url: String(formData.get("cover_url") ?? "").trim() || null,
```

- [ ] **Step 3: 실패하는 실제 DB 테스트를 쓴다**

`tests/live-db/admin.test.ts` 끝에 추가:
```ts
test("admin integration: channel cover_url round-trips and is publicly readable", async () => {
  const { db } = await account("admin");
  const slug = `cover-${randomUUID().slice(0, 8)}`;
  const coverUrl = "https://example.com/covers/test-cover.png";
  try {
    const { id } = check(
      await db
        .from("channels")
        .insert({ name: "커버 테스트 채널", slug, genre: "소설", cover_url: coverUrl })
        .select("id")
        .single(),
    ).data;
    assert.equal(
      check(await publicDb().from("channels").select("cover_url").eq("id", id).single())
        .data.cover_url,
      coverUrl,
    );
    check(await db.from("channels").update({ cover_url: null }).eq("id", id));
    assert.equal(
      check(await publicDb().from("channels").select("cover_url").eq("id", id).single())
        .data.cover_url,
      null,
    );
  } finally {
    check(await serviceDb().from("channels").delete().eq("slug", slug));
  }
});
```

- [ ] **Step 4: 시드 채널에 커버 이미지를 넣는다**

`tests/live-db/fixtures.ts` — 채널 upsert(`.from("channels").upsert({ id: ids.channel, …`) **직전**에 추가:
```ts
  // 채널 홈 히어로가 주 경로(사진 커버)를 찍도록 단색 PNG를 만들어 올린다.
  mkdirSync(".tmp/test-assets", { recursive: true });
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x3b5a6f:s=720x960:d=1",
    "-frames:v",
    "1",
    ".tmp/test-assets/channel-cover.png",
  ]);
  check(
    await db.storage
      .from("covers")
      .upload("tests/channel-cover.png", readFileSync(".tmp/test-assets/channel-cover.png"), {
        contentType: "image/png",
        upsert: true,
      }),
  );
  const coverUrl = db.storage.from("covers").getPublicUrl("tests/channel-cover.png")
    .data.publicUrl;
```
채널 upsert 객체에 `cover_url: coverUrl,`을 `description` 줄 아래에 추가.

- [ ] **Step 5: 시드를 돌리고 인테그레이션 테스트를 돌린다**

```bash
npm run test:seed
node --conditions=react-server --import tsx --test tests/live-db/admin.test.ts
```
Expected: `Isolated test fixtures ready.` 그리고 admin 테스트 전부 `ok` (새 테스트 포함 `# pass 3` 이상, `# fail 0`).

- [ ] **Step 6: 어드민 E2E의 채널 생성에 커버 URL을 넣는다**

`e2e/admin.runtime.spec.ts` "channel create, edit and delete" 테스트에서 `장르 *`를 채우는 줄 다음에:
```ts
  await page
    .getByLabel("커버 이미지 URL", { exact: true })
    .fill("https://example.com/covers/integration.png");
```
DB 조회의 `.select("id")`를 `.select("id, cover_url")`로 바꾸고 `try {` 직전에:
```ts
  expect(channel.cover_url).toBe("https://example.com/covers/integration.png");
```

- [ ] **Step 7: 타입체크 + 커밋**

```bash
npm run typecheck
git add "apps/admin/src/app/admin/(dashboard)/channels/page.tsx" "apps/admin/src/app/admin/(dashboard)/channels/actions.ts" tests/live-db/fixtures.ts tests/live-db/admin.test.ts e2e/admin.runtime.spec.ts
git commit -q -F - <<'EOF'
feat(admin): channel cover image URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 8: 클라이언트 E2E — 동작 단언 + 시각 기준선 재생성

**Files:**
- Modify: `e2e/client.runtime.spec.ts:29-32`
- Regenerate: `e2e/baselines/client/channel-375.png`, `e2e/baselines/client/post-375.png`

- [ ] **Step 1: 런타임 단언을 넓힌다**

`e2e/client.runtime.spec.ts`의
```ts
  await page.goto("/channel/test-walk");
  await expect(
    page.getByRole("heading", { name: "산책하는 문장" }),
  ).toBeVisible();
```
을 아래로 교체:
```ts
  await page.goto("/channel/test-walk");
  await expect(
    page.getByRole("heading", { name: "산책하는 문장" }),
  ).toBeVisible();
  // 게시물 수는 그리드의 30건 캡이 아니라 정확한 발행 수다 (post·linkPost·video = 3, draft 제외).
  await expect(page.getByText("게시물 3", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "영상 이어보기", exact: true }),
  ).toHaveAttribute("href", "/channel/test-walk/reels");
  await expect(
    page.getByRole("button", { name: "채널 공유", exact: true }),
  ).toBeVisible();
  // 타일 목적지는 유형에 따라 갈린다 (§11-58).
  await expect(
    page.getByRole("link", { name: "테스트 산책 영상 게시물", exact: true }),
  ).toHaveAttribute("href", `/channel/test-walk/reels?start=${ids.video}`);
  await expect(
    page.getByRole("link", { name: "테스트 서점 카드 게시물", exact: true }),
  ).toHaveAttribute("href", `/p/${ids.linkPost}`);
  await page
    .getByRole("link", { name: "테스트 산책 카드 게시물", exact: true })
    .click();
  // 카드 상세는 홈 카드다 — 도서 바 버튼이 홈과 같은 이름으로 있고, 뒤로가기는 채널 홈.
  await expect(page).toHaveURL(`/p/${ids.post}`);
  await expect(
    page.getByRole("link", { name: "채널로 돌아가기", exact: true }),
  ).toHaveAttribute("href", "/channel/test-walk");
  await expect(
    page.getByRole("button", { name: "테스트 산책 도서 정보", exact: true }),
  ).toBeVisible();
```

- [ ] **Step 2: 포트 3000·3001이 비어 있는지 확인한다**

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://localhost:3000/about; curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://localhost:3001/admin/login
```
Expected: 둘 다 `000`. **200이 나오면 다른 세션의 서버다 — 멈추고 사용자에게 알린다.** (Playwright가 그 서버를 재사용해 다른 코드를 검사하게 된다.)

- [ ] **Step 3: 프로덕션 빌드 후 런타임 E2E**

```bash
npm run test:build
npx playwright test --project=client e2e/client.runtime.spec.ts
npx playwright test --project=admin e2e/admin.runtime.spec.ts
```
Expected: 모두 passed. (webServer가 `scripts/serve-test.mjs`로 3000·3001을 띄우고 끝나면 내린다.)

- [ ] **Step 4: 시각 기준선 두 장을 재생성한다**

```bash
npx playwright test --project=client --grep "@visual client (channel-375|post-375)" --update-snapshots
git status --short e2e/baselines/client/
```
Expected: `M e2e/baselines/client/channel-375.png`, `M e2e/baselines/client/post-375.png`. 두 PNG를 Read로 열어 의도한 화면(히어로 + 모자이크 / 헤더 + 홈 카드)인지 눈으로 확인한다. 그 뒤 나머지 시각 테스트가 여전히 통과하는지:
```bash
npx playwright test --project=client --grep @visual
```
Expected: 전부 passed (다른 기준선은 바뀌지 않아야 한다 — 바뀌면 원인을 찾는다, 덮어쓰지 않는다).

- [ ] **Step 5: 커밋**

```bash
git add e2e/client.runtime.spec.ts e2e/baselines/client/channel-375.png e2e/baselines/client/post-375.png
git commit -q -F - <<'EOF'
test(e2e): channel home tiles, actions and card detail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9: 전체 검증 · 폴백 경로 캡처 · 정리

**Files:** 없음 (검증만)

- [ ] **Step 1: 빌드·단위·타입**

```bash
npm run build
npm test
npm run typecheck
```
Expected: 셋 다 exit 0. `npm test`에 `post-thumbnail.test.ts` 9건이 포함된다.

- [ ] **Step 2: 폴백 경로를 실제로 그려 본다**

시드 채널에 커버가 있으므로 "커버 없음" 경로는 서비스 롤로 잠깐 비워 캡처하고 되돌린다(dev 서버 3005, Task 5 Step 4의 `capture.cjs`):
```bash
cd "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-channel-home"
node --env-file=.env.test -e "const {createClient}=require('@supabase/supabase-js');const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);db.from('channels').update({cover_url:null}).eq('slug','test-walk').then(r=>{console.log(r.error??'cleared');process.exit(r.error?1:0)})"
URL=http://localhost:3005/channel/test-walk OUT="$SCRATCH/channel-375-nocover.png" node "$SCRATCH/capture.cjs"
npm run test:seed
```
Expected: 커버 없는 캡처에 navy 바탕(아바타도 없으므로) + 흰 글자가 읽힌다. 마지막 `test:seed`가 커버를 복원한다.

- [ ] **Step 3: 다크 테마 캡처**

`capture.cjs`에 `colorScheme` 옵션을 쓰지 말고(테마는 클래스로 정해진다) 프로필에서 다크를 고른 뒤 이동하는 스크립트 `capture-dark.cjs`:
```js
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3005/profile", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "다크", exact: true }).click();
  await page.goto(process.env.URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: process.env.OUT, fullPage: true });
  await browser.close();
})();
```
```bash
URL=http://localhost:3005/channel/test-walk OUT="$SCRATCH/channel-375-dark.png" node "$SCRATCH/capture-dark.cjs"
URL="http://localhost:3005/p/33000000-0000-4000-8000-000000000001" OUT="$SCRATCH/post-375-dark.png" node "$SCRATCH/capture-dark.cjs"
```
Expected: 히어로는 테마와 무관하게 같고(콘텐츠 위 크롬), 그리드 빈 문구·상세 헤더·홈 카드는 다크 토큰으로 바뀐다.

- [ ] **Step 4: dev 서버를 내리고 트리를 정리한다**

3005 서버 프로세스를 종료한다(백그라운드 태스크 중지). `git status --short`가 비어 있는지 확인한다 — `.tmp/`·`.env.test`는 `.gitignore`에 있어야 하며 추적되지 않는다.

- [ ] **Step 5: 결과 보고**

사용자에게 캡처 파일 4장(라이트 채널·상세, 커버 없음, 다크)을 보내고, 통과한 명령 목록과 범위 밖으로 남긴 항목(채널 릴스 뷰어 뒤로가기, 어드민 편집 링크, 커버 업로드, 그리드 페이지네이션)을 적는다. 머지 시 할 일: `npm run db:types` 재생성 확인, 운영 DB에 마이그레이션 적용 후 `supabase migration repair`, 부모 트리와의 PRD §11 행 번호 충돌 해소.
