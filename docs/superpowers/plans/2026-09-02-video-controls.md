# 영상 재생 컨트롤 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mp4·유튜브 영상 게시물이 같은 컨트롤(탭 일시정지 + 음소거 버튼)로 조작되고, 유튜브 자체 UI가 화면에 보이지 않게 한다.

**Architecture:** `VideoPlayer`는 소스 분기와 뷰포트 판정만 맡고, `UploadVideo`(`<video>`)와 `YoutubeVideo`(IFrame API)가 각자 재생을 제어한다. 둘은 같은 모양의 값(`playing`, `muted`, `togglePlay`, `toggleMute`)을 만들어 컨트롤 UI 컴포넌트 `VideoChrome` 하나에 넘긴다. 유튜브 크롬은 크롭(띠를 화면 밖으로) + `playlist=` 제거(⏮⏭ 제거, 루프는 API가 되감기) + 시작 마스크(썸네일)로 막는다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, lucide-react, 유튜브 IFrame Player API (`https://www.youtube.com/iframe_api`, 호스트는 `youtube-nocookie.com`)

**설계 문서:** `docs/superpowers/specs/2026-09-02-video-controls-design.md`

## Global Constraints

- 스타일은 시맨틱 토큰만. 단 피드 크롬의 고정 검정(`bg-black/50`, 스크림)은 기존 처방을 그대로 재사용한다 — 테마 면제 대상이다 (`post-item.tsx` 주석).
- 전역 클라이언트 스토어 도입 금지. 상태는 `useState`/`useRef`만 쓴다 (FRONTEND.md §4).
- `"use client"`는 재생기·컨트롤 leaf 컴포넌트에만. `post-item.tsx`는 서버 컴포넌트로 남는다.
- 배럴 파일(`index.ts` 재수출) 금지. 직접 경로 import. 파일명 kebab-case, named export (FRONTEND.md §1).
- 이미지는 `next/image` + `sizes` 지정 (FRONTEND.md §6).
- 자동재생 영상은 항상 음소거로 시작한다 (FRONTEND.md §2).
- 완료 기준: `npm run build` 통과 + 375px 뷰포트 실제 렌더 확인 (FRONTEND.md §7).
- **검증 환경:** 브라우저 패널이 화면에 보이는 상태에서만 영상 동작을 확인한다. 패널이 가려지면 페이지가 합성을 멈춰 IntersectionObserver가 돌지 않고 크롬이 iframe 재생을 1.5초 안에 멈춘다.
- 이 저장소에는 테스트 러너가 없다. 각 태스크의 검증은 `npm run build` + 브라우저 패널에서의 DOM 단정(assertion)으로 한다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/components/feed/video-chrome.tsx` (신규) | 컨트롤 UI 한 벌 + `VideoControls` 타입. 소스를 모른다 |
| `src/components/feed/upload-video.tsx` (신규) | `<video>` 재생·음소거 제어 |
| `src/components/feed/use-youtube-player.ts` (신규) | IFrame API 스크립트 로드, 플레이어 수명주기, 루프 되감기 |
| `src/components/feed/youtube-video.tsx` (신규) | 유튜브 마운트 + 크롭 + 시작 마스크 + 폴백 임베드 |
| `src/components/feed/video-player.tsx` (수정) | 소스 분기 + IntersectionObserver만 |
| `src/lib/youtube.ts` (수정) | 썸네일 URL 헬퍼 추가, 임베드 URL은 폴백 전용 |
| `next.config.ts` (수정) | `i.ytimg.com` remotePattern |
| `docs/prd-ttokttok.md` (수정) | §5.3 컨트롤 규약, §11 결정 기록 |

---

### Task 1: 공통 컨트롤 UI + mp4 통합

mp4 쪽을 먼저 새 구조로 옮긴다. 유튜브 분기는 이 태스크에서 손대지 않는다 — 지금 동작(크롭 + 투명 오버레이)을 그대로 둔다.

**Files:**
- Create: `src/components/feed/video-chrome.tsx`
- Create: `src/components/feed/upload-video.tsx`
- Modify: `src/components/feed/video-player.tsx`

**Interfaces:**
- Produces: `VideoChrome` 컴포넌트와 `VideoControls` 타입 (`{ playing: boolean; muted: boolean; togglePlay: () => void; toggleMute: () => void }`) — Task 2의 `YoutubeVideo`가 같은 컴포넌트를 쓴다.
- Produces: `UploadVideo({ src: string; poster?: string | null; active: boolean })`.

- [ ] **Step 1: `video-chrome.tsx` 작성**

```tsx
"use client";

import { Play, Volume2, VolumeX } from "lucide-react";

/**
 * 재생기 두 종류(업로드 mp4 / 유튜브 임베드)가 공통으로 만들어 내는 조작.
 * 이 네 개면 컨트롤 UI를 그릴 수 있고, UI는 소스가 무엇인지 알 필요가 없다.
 */
export type VideoControls = {
  playing: boolean;
  muted: boolean;
  togglePlay: () => void;
  toggleMute: () => void;
};

/**
 * 영상 게시물의 컨트롤 한 벌 (설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 탭 레이어가 두 일을 겸한다: 화면 탭으로 재생/일시정지, 그리고 유튜브
 * iframe으로 가는 포인터 삼키기. iframe에 pointer-events:none만 주는 것으로는
 * 못 막는다 — 크로스 오리진 iframe은 별도 프로세스라 브라우저가 히트 테스트를
 * 건너뛰고 이벤트를 그대로 넘기는 경로가 있다.
 *
 * z: 탭 레이어는 z 없음(본문층, iframe 위) — 액션 레일·도서 바(z-3)의 탭을
 * 가로채지 않는다. 가운데 표시와 음소거 버튼은 스크림(z-2) 위여야 하므로 z-3.
 */
export function VideoChrome({ playing, muted, togglePlay, toggleMute }: VideoControls) {
  return (
    <>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "일시정지" : "재생"}
        className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset focus-visible:outline-none"
      />

      {/* 멈춘 동안에만. pointer-events-none — 탭 레이어가 계속 포인터를 받아야 한다. */}
      {playing ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="size-7 fill-current" />
          </span>
        </span>
      )}

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "소리 켜기" : "소리 끄기"}
        // 상단에는 스크림이 없다. 크롬 중 유일하게 자기 배경을 갖는 요소이고,
        // 그림자만으로는 밝은 영상 프레임에서 부족하다.
        className="absolute top-3.5 right-3.5 z-[3] flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 focus-visible:outline-none"
      >
        {muted ? (
          <VolumeX className="size-5" aria-hidden />
        ) : (
          <Volume2 className="size-5" aria-hidden />
        )}
      </button>
    </>
  );
}
```

- [ ] **Step 2: `upload-video.tsx` 작성**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { VideoChrome } from "@/components/feed/video-chrome";

/**
 * 업로드 mp4 재생기 (PRD §5.3).
 *
 * 화면에 들어올 때만 재생한다 — 피드에는 여러 게시물이 동시에 마운트돼
 * 있으므로(가상화 창) 그냥 두면 안 보이는 영상까지 돌아간다. 판정은
 * VideoPlayer의 IntersectionObserver가 하고 여기는 active만 받는다.
 */
export function UploadVideo({
  src,
  poster,
  active,
}: {
  src: string;
  poster?: string | null;
  active: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  // 사용자가 직접 멈춘 영상은 화면을 벗어났다 돌아와도 스스로 재생하지 않는다.
  const pausedByUser = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active && !pausedByUser.current) {
      // 자동재생은 음소거 상태에서만 허용된다. 거부돼도 무시한다.
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active]);

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        // 풀블리드다 — 분할된 상자에 맞추던 레터박스는 필요 없다.
        className="h-full w-full object-cover"
      />

      <VideoChrome
        playing={playing}
        muted={muted}
        togglePlay={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            pausedByUser.current = false;
            el.play().catch(() => {});
          } else {
            pausedByUser.current = true;
            el.pause();
          }
        }}
        toggleMute={() => setMuted((m) => !m)}
      />
    </>
  );
}
```

- [ ] **Step 3: `video-player.tsx`의 업로드 분기를 새 컴포넌트로 교체**

`isUpload && video.video_path` 분기의 `<video>`·음소거 버튼 블록을 지우고 `<UploadVideo …>` 한 줄로 바꾼다. `videoRef`와 `muted` 상태, `videoRef`를 쓰던 `useEffect`도 함께 지운다 — `UploadVideo`로 옮겨갔다. `visible` 상태는 `active`로 이름을 바꾸고, IntersectionObserver 블록과 유튜브 분기는 그대로 둔다.

교체 후 파일 상단은 이렇게 된다:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { UploadVideo } from "@/components/feed/upload-video";
import { youtubeEmbedUrl } from "@/lib/youtube";
import type { FeedVideo } from "@/lib/feed";
```

- [ ] **Step 4: 빌드**

Run: `npm run build`
Expected: `✓ Compiled successfully` — 타입 에러 없음. `Volume2`/`VolumeX` import가 `video-player.tsx`에 남아 있으면 lint가 미사용 import를 잡는다. 지운다.

- [ ] **Step 5: 브라우저에서 mp4 게시물 확인**

패널이 보이는 상태에서 `http://localhost:3001`을 열고, 업로드 영상 게시물(seed의 `source_type: "upload"` 게시물)까지 스크롤한 뒤 확인한다:

```js
// 재생 중이면 탭 레이어의 라벨이 "일시정지"다
!!document.querySelector('button[aria-label="일시정지"]')   // true
!!document.querySelector('button[aria-label="소리 켜기"]')  // true (음소거 시작)
```

탭 레이어를 클릭한 뒤:

```js
!!document.querySelector('button[aria-label="재생"]')  // true — 멈췄다
document.querySelectorAll('span.rounded-full').length >= 1  // 가운데 ▶ 표시
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/feed/video-chrome.tsx src/components/feed/upload-video.tsx src/components/feed/video-player.tsx
git commit -m "feat(feed): 영상 컨트롤 UI 한 벌 분리 + mp4 탭 일시정지"
```

---

### Task 2: 유튜브를 IFrame API로 제어

**Files:**
- Create: `src/components/feed/use-youtube-player.ts`
- Create: `src/components/feed/youtube-video.tsx`
- Modify: `src/lib/youtube.ts`
- Modify: `next.config.ts`
- Modify: `src/components/feed/video-player.tsx`

**Interfaces:**
- Consumes: `VideoChrome`, `VideoControls` (Task 1).
- Produces: `useYoutubePlayer({ videoId: string; active: boolean; mountRef: RefObject<HTMLDivElement | null> })` → `{ ready: boolean; failed: boolean } & VideoControls`. `RefObject`는 `import type { RefObject } from "react"`로 가져온다 — `React.RefObject`는 모듈 안에서 UMD 전역 참조 오류가 난다.
- Produces: `YoutubeVideo({ videoId: string; active: boolean })`.
- Produces: `youtubeThumbnailUrl(id: string): string`.

- [ ] **Step 1: `use-youtube-player.ts` 작성**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * 유튜브 IFrame Player API 중 우리가 쓰는 것만 적은 타입.
 * @types/youtube를 의존성에 추가하지 않는다 — 여기 열 줄로 충분하다.
 */
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    options: {
      host?: string;
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";
const SCRIPT_TIMEOUT_MS = 8000;

// 끝에서 이만큼 남았을 때 되감는다. ENDED로 넘어가면 유튜브가 종료 화면과
// 크롬을 그리므로, 애초에 끝에 닿지 않게 한다.
const LOOP_TAIL_SEC = 0.25;
const LOOP_POLL_MS = 250;

let apiPromise: Promise<YTNamespace> | null = null;

/** 스크립트는 페이지에 한 번만 붙는다. 광고 차단기에 막히면 reject된다. */
function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  const pending = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    const timer = window.setTimeout(
      () => reject(new Error("youtube api timeout")),
      SCRIPT_TIMEOUT_MS,
    );

    // 이 콜백은 API가 전역에서 한 번 부른다. 남의 핸들러를 밟지 않는다.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("youtube api missing"));
    };

    const tag = document.createElement("script");
    tag.src = SCRIPT_SRC;
    tag.async = true;
    tag.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("youtube api blocked"));
    };
    document.head.appendChild(tag);
  });

  // 실패한 프라미스를 캐시에 남기면 다음 게시물도 영원히 실패한다.
  pending.catch(() => {
    apiPromise = null;
  });

  apiPromise = pending;
  return pending;
}

/**
 * 유튜브 임베드를 우리 컨트롤로 조작하기 위한 훅.
 * mountRef가 가리키는 div 안에 API가 iframe을 만든다.
 */
export function useYoutubePlayer({
  videoId,
  active,
  mountRef,
}: {
  videoId: string;
  active: boolean;
  mountRef: RefObject<HTMLDivElement | null>;
}) {
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  // 사용자가 직접 멈춘 영상은 화면을 벗어났다 돌아와도 스스로 재생하지 않는다.
  const pausedByUser = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;

    loadApi()
      .then((YT) => {
        if (cancelled) return;

        // API는 넘긴 노드를 iframe으로 교체한다. React가 소유한 div를
        // 내주면 ref가 사라진 노드를 가리키게 되므로, 안에 자식 노드를
        // 하나 만들어 그것을 내준다.
        const target = document.createElement("div");
        mount.appendChild(target);

        playerRef.current = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              setPlaying(event.data === YT.PlayerState.PLAYING);
              // 폴링이 늦어 끝에 닿은 경우의 안전망.
              if (event.data === YT.PlayerState.ENDED) {
                playerRef.current?.seekTo(0, true);
                playerRef.current?.playVideo();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.replaceChildren();
    };
  }, [videoId, mountRef]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    if (active && !pausedByUser.current) player.playVideo();
    else player.pauseVideo();
  }, [active, ready]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const duration = player.getDuration();
      if (duration > 0 && player.getCurrentTime() >= duration - LOOP_TAIL_SEC) {
        player.seekTo(0, true);
      }
    }, LOOP_POLL_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      pausedByUser.current = true;
      player.pauseVideo();
    } else {
      pausedByUser.current = false;
      player.playVideo();
    }
  }, [playing]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted()) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, []);

  return { ready, failed, playing, muted, togglePlay, toggleMute };
}
```

- [ ] **Step 2: `src/lib/youtube.ts`에 썸네일 헬퍼 추가**

`youtubeEmbedUrl`의 주석을 폴백 전용으로 고치고 아래를 덧붙인다:

```ts
/**
 * 시작 마스크용 썸네일.
 * hqdefault는 모든 영상에 있다 — maxresdefault는 없는 영상이 있어 깨진다.
 */
export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
```

- [ ] **Step 3: `next.config.ts`에 썸네일 호스트 등록**

```ts
import type { NextConfig } from "next";

// 도서 커버·영상은 Supabase Storage의 공개 버킷에서 온다.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  // 유튜브 영상 게시물의 시작 마스크 썸네일.
  { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
];

if (supabaseHost) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: "/storage/v1/object/public/**",
  });
}

const nextConfig: NextConfig = {
  images: { remotePatterns },
};

export default nextConfig;
```

- [ ] **Step 4: `youtube-video.tsx` 작성**

```tsx
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { VideoChrome } from "@/components/feed/video-chrome";
import { useYoutubePlayer } from "@/components/feed/use-youtube-player";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

/**
 * 재생이 시작된 뒤 유튜브가 그리는 컨트롤이 사라질 때까지 덮어 두는 시간.
 * 실측 1~2초 — 넉넉히 잡되 진입 체감이 상하지 않는 값.
 */
const CHROME_FADE_MS = 1500;

/**
 * 유튜브 크롬 띠를 화면 밖으로 밀어내는 크롭.
 * 상단 제목·채널 바와 하단 "동영상 더보기"·로고 바는 iframe의 위아래 끝에
 * 그려지므로, iframe을 위아래로 120px씩 키우면 article의 overflow-hidden이
 * 잘라낸다. 플레이어는 영상을 iframe 중앙에 맞추므로 세로로만 키우고 같은
 * 양을 위로 당기면 영상의 위치·크기는 변하지 않는다.
 *
 * iframe은 replaced 요소라 top·bottom만 주면 늘어나지 않고 기본 150px로
 * 돌아간다 — 높이를 직접 준다.
 */
const CROP = "absolute inset-x-0 -top-30 h-[calc(100%+240px)] w-full border-0";

/**
 * 유튜브 영상 게시물 재생기 (PRD §5.3, 설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 */
export function YoutubeVideo({
  videoId,
  active,
}: {
  videoId: string;
  active: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { failed, playing, muted, togglePlay, toggleMute } = useYoutubePlayer({
    videoId,
    active,
    mountRef,
  });

  // 마스크는 플레이어 생성 직후 한 번만 쓴다. hasPlayed는 false→true로만
  // 바뀌므로 타이머 효과가 한 번만 돈다 — playing에 직접 걸면 사용자가
  // 마스크 도중 탭할 때 타이머가 취소된다.
  const [hasPlayed, setHasPlayed] = useState(false);
  const [masked, setMasked] = useState(true);

  useEffect(() => {
    if (playing) setHasPlayed(true);
  }, [playing]);

  useEffect(() => {
    if (!hasPlayed) return;
    const id = window.setTimeout(() => setMasked(false), CHROME_FADE_MS);
    return () => window.clearTimeout(id);
  }, [hasPlayed]);

  // API 스크립트가 막혔다 — 컨트롤 없이 파라미터 임베드로 되돌린다.
  // 크롬이 조금 보이더라도 영상이 아예 안 나오는 것보다 낫다.
  if (failed) {
    return (
      <iframe
        src={youtubeEmbedUrl(videoId)}
        title="도서 소개 영상"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className={cn(CROP, "pointer-events-none")}
      />
    );
  }

  return (
    <>
      {/* API가 이 div 안에 iframe을 만든다. 크롭은 그 자식에게 건다. */}
      <div
        ref={mountRef}
        className="absolute inset-0 [&>iframe]:pointer-events-none [&>iframe]:absolute [&>iframe]:inset-x-0 [&>iframe]:-top-30 [&>iframe]:h-[calc(100%+240px)] [&>iframe]:w-full [&>iframe]:border-0"
      />

      {/* 시작 마스크. 영상이 레터박스로 들어가므로 검정 바탕 + object-contain. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-black transition-opacity duration-300",
          masked ? "opacity-100" : "opacity-0",
        )}
      >
        <Image
          src={youtubeThumbnailUrl(videoId)}
          alt=""
          fill
          sizes="480px"
          className="object-contain"
        />
      </div>

      <VideoChrome
        playing={playing}
        muted={muted}
        togglePlay={togglePlay}
        toggleMute={toggleMute}
      />
    </>
  );
}
```

- [ ] **Step 5: `video-player.tsx`의 유튜브 분기 교체**

유튜브 분기(`visible ? <iframe …/> : <div className="bg-card …" />`와 그 아래 투명 오버레이 `<div aria-hidden className="absolute inset-0" />`)를 통째로 `<YoutubeVideo videoId={video.youtube_id} active={active} />`로 바꾼다. `youtubeEmbedUrl` import는 지운다 — 폴백은 `youtube-video.tsx`가 쓴다.

교체 후 전체:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { UploadVideo } from "@/components/feed/upload-video";
import { YoutubeVideo } from "@/components/feed/youtube-video";
import type { FeedVideo } from "@/lib/feed";

/**
 * 영상 게시물 재생기 (PRD §5.3).
 *
 * 여기는 소스 분기와 뷰포트 판정만 한다. 재생 제어는 소스별 컴포넌트가
 * 맡고, 컨트롤 UI는 둘이 공유한다 (설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 화면에 들어올 때만 재생한다 — 피드에는 여러 게시물이 동시에 마운트돼
 * 있으므로(가상화 창) 그냥 두면 안 보이는 영상까지 돌아간다.
 * 판정은 IntersectionObserver가 한다 (FRONTEND.md §6).
 */
export function VideoPlayer({
  video,
  poster,
}: {
  video: FeedVideo;
  poster?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.6 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="relative h-full w-full">
      {video.source_type === "upload" && video.video_path ? (
        <UploadVideo src={video.video_path} poster={poster} active={active} />
      ) : video.youtube_id ? (
        <YoutubeVideo videoId={video.youtube_id} active={active} />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          영상을 불러올 수 없어요.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 빌드**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 7: 브라우저에서 유튜브 게시물 확인 (패널 보이는 상태)**

유튜브 영상 게시물까지 스크롤한 뒤:

```js
// API가 iframe을 만들었고 크롭이 걸렸다
(() => {
  const f = document.querySelector('iframe[src*="youtube"]');
  const host = f.parentElement.getBoundingClientRect();
  const rect = f.getBoundingClientRect();
  return {
    src: f.src.includes("playlist=") ? "FAIL: playlist 남음" : "ok",
    crop: Math.round(host.top - rect.top) === 120 && Math.round(rect.bottom - host.bottom) === 120,
  };
})()
// Expected: { src: "ok", crop: true }
```

화면(스크린샷)에서 확인할 것 — 제목 바, "동영상 더보기" 바, ⏮ ⏸ ⏭ 가 **한 번도** 보이지 않는다. 마스크가 걷히는 1.5초 전후로 각각 한 장씩 찍어 비교한다.

컨트롤:

```js
!!document.querySelector('button[aria-label="일시정지"]')  // 재생 중 true
```
탭 레이어 클릭 → `button[aria-label="재생"]`이 나타나고 가운데 ▶ 가 보인다. 다시 클릭 → 재생 재개.
음소거 버튼 클릭 → 라벨이 `소리 끄기`로 바뀌고 소리가 난다.

루프: 16초 영상이므로 15~17초 구간을 연속 촬영해 크롬이 뜨지 않고 처음으로 돌아가는지 본다.

이탈·재진입: 다음 게시물로 스크롤 후 돌아와 마스크 없이 즉시 이어지는지, 그리고 액션 레일·읽기 버튼·도서 바가 여전히 눌리는지 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/feed/use-youtube-player.ts src/components/feed/youtube-video.tsx src/components/feed/video-player.tsx src/lib/youtube.ts next.config.ts
git commit -m "feat(feed): 유튜브를 IFrame API로 제어 — 자체 크롬 제거, 컨트롤 통합"
```

---

### Task 3: 문서 갱신

**Files:**
- Modify: `docs/prd-ttokttok.md` §5.3, §11

- [ ] **Step 1: PRD §5.3의 컨트롤 규약 교체**

`mp4 업로드` 줄의 "탭으로 음소거 해제"를 지우고, 소스 목록 아래에 다음을 넣는다:

```markdown
- **컨트롤은 유형 무관 한 벌** — 화면 탭으로 일시정지/재개(멈춘 동안 가운데 ▶), 우측 상단 버튼으로 음소거 토글. 자동재생은 항상 음소거로 시작한다. 유튜브도 IFrame API로 우리 컨트롤이 제어하고 유튜브 자체 UI는 노출하지 않는다 (설계: `docs/superpowers/specs/2026-09-02-video-controls-design.md`).
```

- [ ] **Step 2: PRD §11 결정 기록에 한 줄 추가**

마지막 행은 `| 41 | 게시물 영역 모델 |`이다 (`docs/prd-ttokttok.md:545`). 그 다음 줄에 붙인다:

```markdown
| 42 | 영상 컨트롤 | 유튜브 자체 UI를 쓰지 않고 **우리 컨트롤 한 벌로 통일**(2026-09-02). 유튜브 임베드는 제목 바·"동영상 더보기" 바·재생 컨트롤을 우리 크롬 위에 그려 남의 서비스처럼 보이고, 게시물 유형마다 조작이 달라졌다. `controls=0`로는 막히지 않아 크롭 + `playlist=` 제거 + 시작 마스크 세 겹으로 가리고, 재생은 IFrame API가 제어한다 |
```

- [ ] **Step 3: 빌드 + 커밋**

Run: `npm run build`
Expected: `✓ Compiled successfully`

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 영상 컨트롤 통합 규약과 결정 기록"
```
