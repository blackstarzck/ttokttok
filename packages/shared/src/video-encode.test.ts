import { describe, expect, it } from "vitest";
import { buildVideoLadder } from "@ttokttok/shared/video-ladder";
import {
  fallbackArgs,
  hlsEncodeArgs,
  parseStreamInfo,
  posterArgs,
} from "@ttokttok/shared/video-encode";

const dump = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input.mp4':",
  "  Duration: 00:01:00.03, start: 0.000000, bitrate: 2480 kb/s",
  "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1080x1920, 2380 kb/s, 30 fps, 30 tbr, 15360 tbn (default)",
  "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 96 kb/s (default)",
];

describe("parseStreamInfo", () => {
  it("영상·음성 스트림과 길이를 읽는다", () => {
    expect(parseStreamInfo(dump)).toEqual({ hasVideo: true, hasAudio: true, hdr: false, durationSec: 60.03 });
  });
  it("무음 원본은 hasAudio=false", () => {
    expect(parseStreamInfo(dump.filter((l) => !l.includes("Audio:"))).hasAudio).toBe(false);
  });
  it("HDR 전송 특성(smpte2084·arib-std-b67)을 잡는다", () => {
    const hdr = dump.map((l) => l.replace("yuv420p(tv, bt709, progressive)", "yuv420p10le(tv, bt2020nc/bt2020/smpte2084)"));
    expect(parseStreamInfo(hdr).hdr).toBe(true);
    const hlg = dump.map((l) => l.replace("bt709, progressive", "bt2020nc/bt2020/arib-std-b67"));
    expect(parseStreamInfo(hlg).hdr).toBe(true);
  });
  it("영상 스트림이 없으면 hasVideo=false, 길이 없으면 null", () => {
    expect(parseStreamInfo(["  Stream #0:0: Audio: aac"])).toEqual({ hasVideo: false, hasAudio: true, hdr: false, durationSec: null });
  });
});

describe("hlsEncodeArgs", () => {
  const r = buildVideoLadder(1080, 1920).renditions[1]; // 720p
  it("PC 도구와 같은 인코딩 인자를 만든다", () => {
    const args = hlsEncodeArgs("input.mp4", r, { preset: "veryfast", hdr: false, hasAudio: true });
    expect(args.slice(0, 2)).toEqual(["-i", "input.mp4"]);
    expect(args).toContain("scale=720:1280,setsar=1");
    expect(args.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 23 -maxrate 1840k -bufsize 3200k -pix_fmt yuv420p -r 30 -g 60 -keyint_min 60 -sc_threshold 0 -force_key_frames expr:gte(t,n_forced*2)");
    expect(args.join(" ")).toContain("-c:a aac -b:a 96k -ac 2");
    expect(args.slice(-2)).toEqual(["720p/segment_%04d.ts", "720p/index.m3u8"]);
    expect(args).toContain("-hls_time");
    expect(args).toContain("independent_segments");
  });
  it("무음 원본에는 음성 인자를 넣지 않는다", () => {
    const args = hlsEncodeArgs("input.mp4", r, { preset: "veryfast", hdr: false, hasAudio: false });
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("0:a:0?");
  });
  it("HDR 원본은 톤매핑 필터와 bt709 색 인자를 붙인다 (PC 도구 전용)", () => {
    const args = hlsEncodeArgs("input.mp4", r, { preset: "fast", hdr: true, hasAudio: true });
    expect(args.find((a) => a.startsWith("zscale=t=linear"))).toMatch(/,scale=720:1280,setsar=1$/);
    expect(args.join(" ")).toContain("-color_primaries bt709 -color_trc bt709 -colorspace bt709");
  });
});

describe("fallbackArgs / posterArgs", () => {
  it("호환 mp4는 스트림 복사 + faststart, 포스터는 첫 프레임 JPEG", () => {
    expect(fallbackArgs("720p/index.m3u8")).toEqual(["-i", "720p/index.m3u8", "-c", "copy", "-movflags", "+faststart", "fallback.mp4"]);
    expect(posterArgs("720p/index.m3u8")).toEqual(["-i", "720p/index.m3u8", "-frames:v", "1", "-q:v", "3", "poster.jpg"]);
  });
});
