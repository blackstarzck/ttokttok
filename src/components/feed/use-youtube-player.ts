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
// 자기 크롬을 그리므로, 애초에 끝에 닿지 않게 한다.
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

        // API는 넘긴 노드를 iframe으로 교체한다. React가 소유한 div를 내주면
        // ref가 사라진 노드를 가리키게 되므로, 자식 노드를 하나 만들어 내준다.
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
