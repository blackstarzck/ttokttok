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
 * 유튜브 임베드의 재생 수명주기를 다루는 훅 — 뷰포트 연동 재생·정지, 끝나기
 * 전 되감기(루프), 음소거 토글. 재생/일시정지 버튼은 플레이어 몫이므로 여기
 * 없다: 상태 이벤트로 결과만 읽는다.
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
  // 재생/일시정지 버튼은 플레이어 것이므로 우리는 상태 이벤트로 그 의사를
  // 읽는다 — 화면에 있는데 PAUSED가 오면 사용자가 누른 것이다(우리가 부르는
  // pauseVideo는 화면을 벗어날 때만 일어난다).
  const pausedByUser = useRef(false);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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
            playsinline: 1,
            rel: 0,
            // disablekb는 두지 않는다 — 재생/일시정지가 플레이어 몫이 됐으니
            // 키보드(스페이스/k)도 플레이어가 받아야 조작 경로가 남는다.
            fs: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              // BUFFERING·UNSTARTED는 상태를 흔들지 않는다 — 재생 중 버퍼링이
              // 걸려도 재생 의도는 그대로다(루프 폴링이 끊기면 안 된다).
              if (event.data === YT.PlayerState.PLAYING) {
                setPlaying(true);
                pausedByUser.current = false;
              } else if (event.data === YT.PlayerState.PAUSED) {
                setPlaying(false);
                if (activeRef.current) pausedByUser.current = true;
              } else if (event.data === YT.PlayerState.ENDED) {
                // 폴링이 늦어 끝에 닿은 경우의 안전망.
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

  return { ready, failed, playing, muted, toggleMute };
}
