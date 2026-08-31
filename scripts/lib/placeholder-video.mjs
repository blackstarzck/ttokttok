/**
 * 시드용 임시 세로 영상 (PRD §5.3).
 *
 * 피드에 카드 게시물만 있으면 영상 분기(post-item.tsx)가 한 번도
 * 렌더되지 않는다. 저작권 있는 실제 영상을 시드에 넣을 수는 없으므로
 * ffmpeg으로 9:16 그라디언트 클립을 그 자리에서 만든다.
 *
 * 실제 영상 콘텐츠가 들어오면 이 파일과 seed.mjs의 videoPosts를 지운다.
 * ffmpeg이 없으면 영상 시드만 건너뛴다 — 나머지 시드는 그대로 돈다.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 한글이 그려지는 폰트를 OS별로 하나만 찾으면 된다. 없으면 자막을 생략한다. */
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/malgun.ttf",
  "/System/Library/Fonts/AppleSDGothicNeo.ttc",
  "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
];

/**
 * 필터 옵션 값의 `\ : ' %` 이스케이프.
 *
 * 백슬래시가 둘인 이유: 값이 필터그래프 파서와 필터인자 파서를 차례로
 * 지나면서 각 단계가 하나씩 벗겨 먹는다. 하나만 붙이면 윈도우 경로의
 * `C:` 가 인자 파서에서 구분자로 잘려 "No option name" 이 난다.
 */
const esc = (s) => String(s).replace(/[\\:'%]/g, (c) => "\\\\" + c);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    p.stderr.on("data", (c) => (stderr += c));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `ffmpeg exit ${code}`)),
    );
  });
}

/** ffmpeg 실행 가능 여부. 없으면 호출부가 영상 시드를 건너뛴다. */
export async function hasFfmpeg() {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 1080x1920 mp4 한 편을 만들어 Buffer로 돌려준다.
 *
 * 무음 오디오 트랙을 넣는다 — 음소거 토글(video-player.tsx)이 실제로
 * 걸 대상이 있어야 하기 때문이다.
 */
let tmpSeq = 0;

export async function makePlaceholderVideo({
  title,
  from = "0x141a3a",
  to = "0x5b4b8a",
  seconds = 8,
}) {
  // 제목은 한글이라 파일명으로 못 쓴다 — 순번으로 겹치지 않게만 한다.
  const out = join(tmpdir(), `ttokttok-seed-${++tmpSeq}.mp4`);
  const font = FONT_CANDIDATES.find((p) => existsSync(p));

  const drawtext = font
    ? [
        "-vf",
        [
          `drawtext=fontfile=${esc(font)}:text=${esc(title)}` +
            ":fontcolor=white:fontsize=76:x=(w-text_w)/2:y=(h-text_h)/2-60",
          `drawtext=fontfile=${esc(font)}:text=${esc("임시 샘플 영상")}` +
            ":fontcolor=0xffffff@0.6:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2+80",
        ].join(","),
      ]
    : [];

  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `gradients=s=1080x1920:c0=${from}:c1=${to}:x0=0:y0=0:x1=1080:y1=1920:speed=0.04:d=${seconds}:r=24`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    ...drawtext,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "30",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "32k",
    "-shortest",
    "-t",
    String(seconds),
    "-movflags",
    "+faststart",
    out,
  ]);

  const buf = await readFile(out);
  await unlink(out).catch(() => {});
  return buf;
}
