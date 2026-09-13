import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { BROWSER_LIMITS, fallbackArgs, hlsEncodeArgs, parseStreamInfo, posterArgs } from "@ttokttok/shared/video-encode";
import { buildMasterPlaylist, buildVideoLadder, toManifestRendition } from "@ttokttok/shared/video-ladder";
import type { VideoManifest } from "@ttokttok/shared/video-bundle";
import { validateBundleFiles } from "@/lib/video-upload";

/**
 * 브라우저 안에서 mp4를 HLS 묶음으로 변환한다 (설계 §4).
 *
 * 산출물은 PC 도구(scripts/convert-video.mjs)와 파일 단위로 같다 — 사다리·
 * 인코딩 인자·마스터 재생 목록이 전부 packages/shared의 같은 함수에서 나온다.
 * 결과는 readVideoBundle과 같은 { manifest, bytes } 모양이라, 그 뒤 업로드·
 * 서버 검증은 ZIP을 올렸을 때와 한 줄도 다르지 않다.
 *
 * 코어(GPL)는 jsdelivr에서 버전 고정으로 받는다. 워커가 blob URL에서 뜨므로
 * CORS 설정이 필요 없다. 단일 스레드라 느리다 — 상한은 BROWSER_LIMITS.
 */
// 반드시 esm 빌드다 (Task 2 스파이크 실측). 래퍼는 워커를 type:"module"로
// 만들고, module 워커는 importScripts를 못 써서 코어를 import()로 읽는다 —
// default export가 있는 esm 코어만 된다. umd 코어를 주면 조용히 멈춘다.
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

export type ConvertProgress = {
  stage: "load" | "probe" | "encode" | "finish";
  /** encode 단계의 화질 라벨. */
  label?: string;
  /** encode 단계: 몇 번째 화질인가 (1부터). */
  index: number;
  total: number;
  /** 현재 단계 안의 진행률 0~1. */
  ratio: number;
};

export class ConvertError extends Error {
  hint?: "pc-tool";
  constructor(message: string, hint?: "pc-tool") {
    super(message);
    this.hint = hint;
  }
}

const PC_TOOL = " PC 변환 도구(scripts/convert-video.cmd)로 만든 ZIP을 올려 주세요.";

/** <video> 메타데이터로 표시 크기·길이를 읽는다. 회전은 브라우저가 이미 반영한다. */
export function probeVideoFile(file: File): Promise<{ width: number; height: number; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = () => { URL.revokeObjectURL(url); video.removeAttribute("src"); video.load(); };
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, durationSec: video.duration };
      done();
      if (!result.width || !result.height || !Number.isFinite(result.durationSec)) reject(new ConvertError("영상 정보를 읽을 수 없습니다. mp4(H.264) 파일인지 확인하세요."));
      else resolve(result);
    };
    video.onerror = () => { done(); reject(new ConvertError("브라우저가 이 영상을 열 수 없습니다." + PC_TOOL, "pc-tool")); };
    video.src = url;
  });
}

function checkLimits(file: File, durationSec: number) {
  if (file.size > BROWSER_LIMITS.maxFileBytes)
    throw new ConvertError(`브라우저 변환은 ${Math.round(BROWSER_LIMITS.maxFileBytes / 1024 / 1024)}MB 이하 파일만 받습니다.` + PC_TOOL, "pc-tool");
  if (durationSec > BROWSER_LIMITS.maxDurationSec)
    throw new ConvertError(`브라우저 변환은 ${BROWSER_LIMITS.maxDurationSec}초 이하 영상만 받습니다.` + PC_TOOL, "pc-tool");
}

async function readDirFiles(ffmpeg: FFmpeg, dir: string): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await ffmpeg.listDir(dir)) {
    if (entry.isDir) continue;
    const data = await ffmpeg.readFile(`${dir}/${entry.name}`);
    out[`${dir}/${entry.name}`] = typeof data === "string" ? new TextEncoder().encode(data) : data;
  }
  return out;
}

export async function convertVideoFile(
  file: File,
  opts: { onProgress: (p: ConvertProgress) => void; signal: AbortSignal },
): Promise<{ manifest: VideoManifest; bytes: Record<string, Uint8Array> }> {
  const probe = await probeVideoFile(file);
  checkLimits(file, probe.durationSec);
  const ladder = buildVideoLadder(probe.width, probe.height);
  const renditions = ladder.renditions.filter((r) => Number(r.label.replace("p", "")) <= BROWSER_LIMITS.maxLevel);
  const fallback = renditions.includes(ladder.fallback) ? ladder.fallback : renditions[renditions.length - 1];
  const total = renditions.length;

  const ffmpeg = new FFmpeg();
  const logs: string[] = [];
  ffmpeg.on("log", ({ message }) => { logs.push(message); if (logs.length > 400) logs.shift(); });
  const abort = () => ffmpeg.terminate();
  opts.signal.addEventListener("abort", abort, { once: true });
  const aborted = () => { if (opts.signal.aborted) throw new ConvertError("변환을 중단했습니다."); };

  try {
    opts.onProgress({ stage: "load", index: 0, total, ratio: 0 });
    // 워커는 래퍼가 `new URL("./worker.js", import.meta.url)`로 만든다 — 번들러
    // (Turbopack)가 그 워커 파일을 같은 출처 자산으로 내보내야 한다. Task 2
    // 스파이크 실측: 워커를 CDN blob으로 넘기는 classWorkerURL 방식은 어느
    // 빌드로도 동작하지 않는다(ESM worker.js는 상대 import가 blob에서 풀리지
    // 않고, UMD 워커는 module 워커에서 importScripts가 막힌다). 빌드 뒤
    // 브라우저에서 load()가 풀리는지 반드시 확인하고, Turbopack이 worker.js를
    // 자산으로 내보내지 못하면 `apps/admin/public/ffmpeg/`에 dist/esm의
    // worker.js·const.js·errors.js를 복사해 `classWorkerURL: "/ffmpeg/worker.js"`
    // (같은 출처, 상대 import 해결)로 넘기는 것이 대안이다.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    aborted();
    await ffmpeg.writeFile("input", new Uint8Array(await file.arrayBuffer()));

    // 스트림 덤프 — 출력이 없어 종료 코드는 0이 아니지만 로그는 찍힌다.
    opts.onProgress({ stage: "probe", index: 0, total, ratio: 0 });
    logs.length = 0;
    await ffmpeg.exec(["-i", "input"]);
    const info = parseStreamInfo(logs);
    if (!info.hasVideo) throw new ConvertError("영상 스트림이 없는 파일입니다.");
    if (info.hdr) throw new ConvertError("HDR 영상은 브라우저에서 변환할 수 없습니다." + PC_TOOL, "pc-tool");
    aborted();

    let current = 0;
    ffmpeg.on("progress", ({ progress }) => {
      opts.onProgress({ stage: "encode", label: renditions[current]?.label, index: current + 1, total, ratio: Math.min(1, Math.max(0, progress)) });
    });
    for (const [i, r] of renditions.entries()) {
      current = i;
      opts.onProgress({ stage: "encode", label: r.label, index: i + 1, total, ratio: 0 });
      await ffmpeg.createDir(r.label);
      const code = await ffmpeg.exec(hlsEncodeArgs("input", r, { preset: BROWSER_LIMITS.preset, hdr: false, hasAudio: info.hasAudio }));
      aborted();
      if (code !== 0) throw new ConvertError(`${r.label} 변환에 실패했습니다: ${logs.filter((l) => /error/i.test(l)).slice(-1)[0] ?? `ffmpeg 종료 ${code}`}`);
    }

    opts.onProgress({ stage: "finish", index: total, total, ratio: 0 });
    if ((await ffmpeg.exec(fallbackArgs(fallback.playlist))) !== 0) throw new ConvertError("호환 mp4 생성에 실패했습니다.");
    if ((await ffmpeg.exec(posterArgs(fallback.playlist))) !== 0) throw new ConvertError("첫 화면 이미지 생성에 실패했습니다.");
    aborted();

    const bytes: Record<string, Uint8Array> = {};
    for (const r of renditions) Object.assign(bytes, await readDirFiles(ffmpeg, r.label));
    for (const name of ["fallback.mp4", "poster.jpg"]) {
      const data = await ffmpeg.readFile(name);
      bytes[name] = typeof data === "string" ? new TextEncoder().encode(data) : data;
    }
    bytes["master.m3u8"] = new TextEncoder().encode(buildMasterPlaylist(renditions));
    const files = Object.entries(bytes).map(([path, data]) => ({ path, size: data.length }));
    const manifest = {
      version: 1 as const,
      duration: probe.durationSec,
      master: "master.m3u8" as const,
      fallback: "fallback.mp4" as const,
      poster: "poster.jpg" as const,
      renditions: renditions.map(toManifestRendition),
      files,
    };
    bytes["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    opts.onProgress({ stage: "finish", index: total, total, ratio: 1 });
    // ZIP과 같은 검증 — 여기서 걸리면 우리 산출물이 우리 규칙을 어긴 것이다.
    return validateBundleFiles(bytes);
  } finally {
    opts.signal.removeEventListener("abort", abort);
    try { ffmpeg.terminate(); } catch { /* 이미 종료됨 */ }
  }
}
