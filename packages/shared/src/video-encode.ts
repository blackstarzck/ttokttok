import type { LadderRendition } from "./video-ladder";

/**
 * FFmpeg 인자와 로그 해석 — PC 도구와 브라우저 변환이 공유하는 순수 함수.
 * 산출물이 파일 단위로 같아야 하므로 인코딩 인자는 여기 한 곳에만 있다.
 */
export type StreamInfo = {
  hasVideo: boolean;
  hasAudio: boolean;
  hdr: boolean;
  durationSec: number | null;
};

/** `ffmpeg -i input` 이 stderr에 찍는 스트림 덤프를 읽는다. */
export function parseStreamInfo(logLines: string[]): StreamInfo {
  const text = logLines.join("\n");
  const duration = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    hasVideo: /Stream #\d+:\d+.*: Video:/.test(text),
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(text),
    hdr: /smpte2084|arib-std-b67/.test(text),
    durationSec: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : null,
  };
}

/**
 * 브라우저 경로 상한 (설계 §4.4, 2026-09-13 스파이크로 확정).
 * 1080p는 720p 대비 약 2배 시간이 걸려서 maxLevel을 720으로 제한.
 * PC 도구는 10분·512MiB까지 받으므로 넘는 파일은 그쪽으로 안내한다.
 */
export const BROWSER_LIMITS = {
  maxDurationSec: 180,
  maxFileBytes: 300 * 1024 * 1024,
  preset: "veryfast",
  /** 브라우저에서 만드는 최대 화질(짧은 변). 1080을 빼기로 했으면 720. */
  maxLevel: 720,
} as const;

const HDR_PREFIX =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,";

export function hlsEncodeArgs(
  input: string,
  r: LadderRendition,
  opts: { preset: string; hdr: boolean; hasAudio: boolean },
): string[] {
  const dir = r.label;
  return [
    "-i", input,
    "-map", "0:v:0",
    ...(opts.hasAudio ? ["-map", "0:a:0?"] : []),
    "-vf", `${opts.hdr ? HDR_PREFIX : ""}scale=${r.width}:${r.height},setsar=1`,
    // Constrained quality encoding: static book/text clips should not fill a fixed bitrate budget.
    "-c:v", "libx264", "-preset", opts.preset, "-crf", "23",
    "-maxrate", `${Math.round(r.rate * 1.15)}k`, "-bufsize", `${r.rate * 2}k`,
    "-pix_fmt", "yuv420p",
    ...(opts.hdr ? ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"] : []),
    "-r", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-force_key_frames", "expr:gte(t,n_forced*2)",
    ...(opts.hasAudio ? ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] : []),
    "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", `${dir}/segment_%04d.ts`,
    `${dir}/index.m3u8`,
  ];
}

export function fallbackArgs(playlist: string): string[] {
  return ["-i", playlist, "-c", "copy", "-movflags", "+faststart", "fallback.mp4"];
}

export function posterArgs(playlist: string): string[] {
  return ["-i", playlist, "-frames:v", "1", "-q:v", "3", "poster.jpg"];
}
