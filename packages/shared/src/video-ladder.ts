/**
 * 화질 사다리 — PC 변환 도구(scripts/convert-video.mjs)와 브라우저 변환
 * (apps/admin/src/lib/video-convert.ts)이 같은 함수를 쓴다. 두 경로의
 * 산출물이 파일 단위로 같아야 재생기·검증이 하나로 유지된다.
 *
 * 입력 크기는 회전 메타데이터가 이미 반영된 표시 크기다. 브라우저의
 * videoWidth/videoHeight가 그렇고, PC 도구는 ffprobe 회전값으로 바꿔 넘긴다.
 */
export type LadderRendition = {
  label: string;
  width: number;
  height: number;
  /** kbps — 인코더의 maxrate/bufsize 계산에 쓴다. */
  rate: number;
  /** bps — HLS 재생 목록의 BANDWIDTH. */
  bandwidth: number;
  playlist: string;
};

const LEVELS = [480, 720, 1080] as const;

function rateFor(level: number) {
  return level <= 480 ? 800 : level <= 720 ? 1600 : 3000;
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export function buildVideoLadder(width: number, height: number): {
  renditions: LadderRendition[];
  fallback: LadderRendition;
} {
  const short = Math.min(width, height);
  const shortEven = even(short);
  const levels: number[] = LEVELS.filter((n) => n <= short);
  // 원본보다 큰 화질은 만들지 않는다. 작은 원본은 그 크기 하나만.
  if (!levels.length) levels.push(shortEven);
  const renditions = levels.map((level) => {
    const rate = rateFor(level);
    return {
      label: `${level}p`,
      width: even((width * level) / shortEven),
      height: even((height * level) / shortEven),
      rate,
      bandwidth: Math.round((rate * 1.15 + 96) * 1000),
      playlist: `${level}p/index.m3u8`,
    };
  });
  // 호환 mp4는 짧은 변 720 이하 중 가장 큰 화질에서 뜬다.
  const fallback =
    [...renditions].reverse().find((r) => Math.min(r.width, r.height) <= 720) ??
    renditions[0];
  return { renditions, fallback };
}

export function toManifestRendition(r: LadderRendition) {
  return {
    label: r.label,
    width: r.width,
    height: r.height,
    bandwidth: r.bandwidth,
    playlist: r.playlist,
  };
}

export function buildMasterPlaylist(renditions: LadderRendition[]): string {
  return (
    "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n" +
    renditions
      .map(
        (r) =>
          `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}\n${r.playlist}\n`,
      )
      .join("")
  );
}
