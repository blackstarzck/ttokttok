// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- Upstream light build omits types; app consumers must include this ambient shim too.
/// <reference path="./hls-light.d.ts" />
// Our converter produces muxed H.264/AAC TS; alternate audio, subtitles and DRM are unused.
import Hls from "hls.js/light";

export type VideoController = {
  setActive: (active: boolean) => void;
  setQuality: (index: number) => void;
  retry: () => void;
  destroy: () => void;
};

/** Loaded only for videos that have an HLS source, never by the app shell. */
export function attachHls(video: HTMLVideoElement, options: {
  hls: string; fallback: string; active: boolean;
  qualities?: string[];
  onReady: () => void; onError: () => void;
}): VideoController {
  let active = options.active, destroyed = false, fallback = false, recovered = false;
  let hls: Hls | null = null;
  let firstBuffered = false;
  let savedTime = video.currentTime || 0;
  const native = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
  const loaded = () => {
    if (destroyed) return;
    if (savedTime > 0 && savedTime < video.duration) { video.currentTime = savedTime; savedTime = 0; }
    options.onReady();
  };
  const toFallback = () => {
    if (destroyed) return;
    if (fallback) { options.onError(); return; }
    fallback = true;
    savedTime = video.currentTime || savedTime;
    hls?.destroy(); hls = null;
    video.src = options.fallback;
    video.preload = active ? "auto" : "metadata";
    video.load();
  };
  const error = () => { if (!hls) toFallback(); };
  video.addEventListener("loadedmetadata", loaded);
  video.addEventListener("error", error);
  const start = () => {
    firstBuffered = false; recovered = false; fallback = false;
    if (native) {
      video.preload = active ? "auto" : "metadata";
      video.src = options.hls; video.load();
    } else if (Hls.isSupported()) {
      hls = new Hls({ startLevel: 0, autoStartLoad: false, maxBufferLength: 10,
        maxMaxBufferLength: 20, backBufferLength: 4, maxBufferSize: 12 * 1024 * 1024,
        capLevelToPlayerSize: true });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { hls?.startLoad(0); options.onReady(); });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        firstBuffered = true;
        if (!active) hls?.stopLoad();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || destroyed) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; hls?.recoverMediaError(); }
        else toFallback();
      });
      hls.loadSource(options.hls); hls.attachMedia(video);
    } else toFallback();
  };
  start();
  return {
    setActive(value) {
      if (destroyed || active === value) return;
      active = value;
      if (hls) {
        if (active) hls.startLoad(-1);
        else if (firstBuffered) hls.stopLoad();
      } else video.preload = active ? "auto" : "metadata";
    },
    setQuality(index) {
      if (hls) hls.currentLevel = index;
      else if (native && !fallback) {
        savedTime = video.currentTime;
        const wasPlaying = !video.paused;
        video.src = index >= 0 ? options.qualities?.[index] ?? options.hls : options.hls;
        if (wasPlaying) video.addEventListener('loadedmetadata', () => { void video.play().catch(() => {}); }, { once: true });
        video.load();
      }
    },
    retry() {
      if (destroyed) return;
      savedTime = video.currentTime || savedTime;
      hls?.destroy(); hls = null; start();
    },
    destroy() {
      destroyed = true; hls?.destroy(); hls = null;
      video.removeEventListener("loadedmetadata", loaded); video.removeEventListener("error", error);
      video.pause(); video.removeAttribute("src"); video.load();
    },
  };
}
