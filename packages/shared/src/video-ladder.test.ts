import { describe, expect, it } from "vitest";
import {
  buildMasterPlaylist,
  buildVideoLadder,
  toManifestRendition,
} from "@ttokttok/shared/video-ladder";

describe("buildVideoLadder", () => {
  it("1080 세로 원본은 480·720·1080 세 화질, fallback은 720", () => {
    const { renditions, fallback } = buildVideoLadder(1080, 1920);
    expect(renditions.map((r) => r.label)).toEqual(["480p", "720p", "1080p"]);
    expect(renditions[0]).toMatchObject({ width: 480, height: 852, rate: 800, playlist: "480p/index.m3u8" });
    expect(renditions[1]).toMatchObject({ width: 720, height: 1280, rate: 1600 });
    expect(renditions[2]).toMatchObject({ width: 1080, height: 1920, rate: 3000 });
    expect(fallback.label).toBe("720p");
  });

  it("720 가로 원본은 480·720 두 화질이고 짝수 크기로 내린다", () => {
    const { renditions } = buildVideoLadder(1280, 720);
    expect(renditions.map((r) => r.label)).toEqual(["480p", "720p"]);
    expect(renditions[0]).toMatchObject({ width: 852, height: 480 });
    expect(renditions[1]).toMatchObject({ width: 1280, height: 720 });
  });

  it("작은 원본은 짝수로 내린 원본 크기 한 화질만 만든다", () => {
    const { renditions, fallback } = buildVideoLadder(361, 641);
    expect(renditions).toHaveLength(1);
    expect(renditions[0]).toMatchObject({ label: "360p", width: 360, height: 638, rate: 800 });
    expect(fallback.label).toBe("360p");
  });

  it("홀수 짧은 변도 분모는 원본 그대로다 — 옛 PC 도구와 같은 값", () => {
    const { renditions } = buildVideoLadder(721, 1281);
    expect(renditions.map((r) => r.label)).toEqual(["480p", "720p"]);
    expect(renditions[0]).toMatchObject({ width: 480, height: 852 });
    expect(renditions[1]).toMatchObject({ width: 720, height: 1278 });
  });

  it("bandwidth는 (rate×1.15 + 96)×1000을 반올림한 값이다", () => {
    const { renditions } = buildVideoLadder(1080, 1920);
    expect(renditions[0].bandwidth).toBe(Math.round((800 * 1.15 + 96) * 1000));
  });

  it("toManifestRendition은 rate를 뗀다", () => {
    const { renditions } = buildVideoLadder(1080, 1920);
    expect(Object.keys(toManifestRendition(renditions[0])).sort()).toEqual(
      ["bandwidth", "height", "label", "playlist", "width"],
    );
  });
});

describe("buildMasterPlaylist", () => {
  it("화질마다 STREAM-INF 한 줄과 재생 목록 경로 한 줄을 쓴다", () => {
    const { renditions } = buildVideoLadder(1280, 720);
    const text = buildMasterPlaylist(renditions);
    expect(text.startsWith("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n")).toBe(true);
    expect(text).toContain(`#EXT-X-STREAM-INF:BANDWIDTH=${renditions[0].bandwidth},RESOLUTION=852x480\n480p/index.m3u8\n`);
    expect(text.endsWith("720p/index.m3u8\n")).toBe(true);
  });
});
