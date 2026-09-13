import { describe, expect, it } from "vitest";
import { validateBundleFiles } from "@/lib/video-upload";

const enc = (s: string) => new TextEncoder().encode(s);
function bundle() {
  const files: Record<string, Uint8Array> = {
    "360p/index.m3u8": enc("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nsegment_0000.ts\n#EXTINF:1.0,\nsegment_0001.ts\n#EXT-X-ENDLIST\n"),
    "360p/segment_0000.ts": new Uint8Array([1, 2, 3]),
    "360p/segment_0001.ts": new Uint8Array([4, 5]),
    "master.m3u8": enc("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=1016000,RESOLUTION=360x640\n360p/index.m3u8\n"),
    "fallback.mp4": new Uint8Array([9, 9, 9, 9]),
    "poster.jpg": new Uint8Array([7]),
  };
  const manifest = {
    version: 1, duration: 3, master: "master.m3u8", fallback: "fallback.mp4", poster: "poster.jpg",
    renditions: [{ label: "360p", width: 360, height: 640, bandwidth: 1016000, playlist: "360p/index.m3u8" }],
    files: Object.entries(files).map(([path, data]) => ({ path, size: data.length })),
  };
  files["manifest.json"] = enc(JSON.stringify(manifest));
  return files;
}

describe("validateBundleFiles", () => {
  it("변환기가 만든 최소 묶음을 통과시킨다", () => {
    const { manifest, bytes } = validateBundleFiles(bundle());
    expect(manifest.renditions[0].label).toBe("360p");
    expect(Object.keys(bytes)).toHaveLength(7);
  });
  it("manifest.json이 없으면 거부한다", () => {
    const b = bundle(); delete b["manifest.json"];
    expect(() => validateBundleFiles(b)).toThrow("변환 도구가 만든 ZIP 파일을 선택하세요.");
  });
  it("manifest에 없는 파일이 섞이면 거부한다", () => {
    const b = bundle(); b["extra.txt"] = new Uint8Array([1]);
    expect(() => validateBundleFiles(b)).toThrow("허용되지 않는 파일");
  });
  it("크기가 다르면 거부한다", () => {
    const b = bundle(); b["poster.jpg"] = new Uint8Array([7, 7]);
    expect(() => validateBundleFiles(b)).toThrow("크기 불일치");
  });
  it("재생 목록이 외부 파일을 가리키면 거부한다", () => {
    const b = bundle();
    b["360p/index.m3u8"] = enc("#EXTM3U\n#EXTINF:2.0,\nhttps://evil.example/x.ts\n#EXT-X-ENDLIST\n");
    // 크기도 맞춰 준다 — 검증 순서상 크기 검사가 먼저다.
    const m = JSON.parse(new TextDecoder().decode(b["manifest.json"]));
    m.files.find((f: { path: string }) => f.path === "360p/index.m3u8").size = b["360p/index.m3u8"].length;
    b["manifest.json"] = enc(JSON.stringify(m));
    expect(() => validateBundleFiles(b)).toThrow();
  });
});
