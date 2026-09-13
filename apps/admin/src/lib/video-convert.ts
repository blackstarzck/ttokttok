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

const toBytes = (data: Uint8Array | string) => typeof data === "string" ? new TextEncoder().encode(data) : data;

async function readDirFiles(ffmpeg: FFmpeg, dir: string): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await ffmpeg.listDir(dir)) {
    if (entry.isDir) continue;
    const data = await ffmpeg.readFile(`${dir}/${entry.name}`);
    out[`${dir}/${entry.name}`] = toBytes(data);
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
    // Task 5 빌드된 admin(Turbopack) 실측 (두 겹의 함정, 콘솔에는 아무 것도
    // 안 남고 catch로 조용히 들어온다):
    // 1) 래퍼 기본값인 `new URL("./worker.js", import.meta.url)`로 워커를
    //    만들면 Turbopack이 worker.js를 프로젝트 자산으로 번들링하면서, 그
    //    안의 `import(/* @vite-ignore */ _coreURL)`(coreURL은 런타임 blob:
    //    URL이라 정적으로 알 수 없다)를 자기 방식대로 다시 써서 브라우저에서
    //    "Cannot find module as expression is too dynamic"으로 즉시 실패한다.
    //    고쳐서: worker.js·const.js·errors.js를
    //    `apps/admin/public/ffmpeg/`에 그대로 복사해 두고 `classWorkerURL`로
    //    그 정적 자산을 가리키면, 번들러가 이 파일을 전혀 건드리지 않아 안의
    //    동적 import()가 브라우저 네이티브로(blob: URL 포함) 그대로 실행된다.
    // 2) 그런데 래퍼(@ffmpeg/ffmpeg classes.js)가 워커를 만드는 코드 자체가
    //    `new Worker(new URL(classWorkerURL, import.meta.url))`라, Turbopack이
    //    `new URL(x, import.meta.url)` 패턴을 (x가 런타임 값이어도) 정적으로
    //    다시 쓰면서 이 파일에서는 import.meta.url을 `file:///...` 빌드 경로
    //    문자열로 굳혀버린다 — `new URL("/ffmpeg/worker.js", "file:///...")`가
    //    `file:///ffmpeg/worker.js`가 되어 SecurityError로 워커 생성 자체가
    //    막힌다. classWorkerURL을 처음부터 완전한 origin URL로 주면(첫 인자가
    //    이미 절대 URL이면 URL 생성자가 base를 무시한다) 이 오염된 base를
    //    피해간다.
    await ffmpeg.load({
      classWorkerURL: `${location.origin}/ffmpeg/worker.js`,
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
    let phase: "encode" | "finish" = "encode";
    const onProgressEvent = ({ progress }: { progress: number }) => {
      if (phase !== "encode") return;
      opts.onProgress({ stage: "encode", label: renditions[current]?.label, index: current + 1, total, ratio: Math.min(1, Math.max(0, progress)) });
    };
    ffmpeg.on("progress", onProgressEvent);
    for (const [i, r] of renditions.entries()) {
      current = i;
      opts.onProgress({ stage: "encode", label: r.label, index: i + 1, total, ratio: 0 });
      await ffmpeg.createDir(r.label);
      const code = await ffmpeg.exec(hlsEncodeArgs("input", r, { preset: BROWSER_LIMITS.preset, hdr: false, hasAudio: info.hasAudio }));
      aborted();
      if (code !== 0) throw new ConvertError(`${r.label} 변환에 실패했습니다: ${logs.filter((l) => /error/i.test(l)).slice(-1)[0] ?? `ffmpeg 종료 ${code}`}`);
    }
    ffmpeg.off("progress", onProgressEvent);
    phase = "finish";

    opts.onProgress({ stage: "finish", index: total, total, ratio: 0 });
    if ((await ffmpeg.exec(fallbackArgs(fallback.playlist))) !== 0) throw new ConvertError("호환 mp4 생성에 실패했습니다.");
    if ((await ffmpeg.exec(posterArgs(fallback.playlist))) !== 0) throw new ConvertError("첫 화면 이미지 생성에 실패했습니다.");
    aborted();

    const bytes: Record<string, Uint8Array> = {};
    for (const r of renditions) Object.assign(bytes, await readDirFiles(ffmpeg, r.label));
    for (const name of ["fallback.mp4", "poster.jpg"]) {
      const data = await ffmpeg.readFile(name);
      bytes[name] = toBytes(data);
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
  } catch (error) {
    // terminate()가 진행 중이던 await를 라이브러리 고유 에러로 거부시킨다 —
    // 사용자 취소라면 그 원문 대신 우리 메시지로 감싼다.
    if (opts.signal.aborted) throw new ConvertError("변환을 중단했습니다.");
    throw error;
  } finally {
    opts.signal.removeEventListener("abort", abort);
    try { ffmpeg.terminate(); } catch { /* 이미 종료됨 */ }
  }
}
