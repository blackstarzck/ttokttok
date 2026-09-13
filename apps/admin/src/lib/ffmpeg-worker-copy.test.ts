import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Turbopack이 @ffmpeg/ffmpeg의 워커를 자산으로 내보내지 못해 dist/esm의 워커
 * 파일을 apps/admin/public/ffmpeg/에 복사해 둔다 (video-convert.ts). 래퍼를
 * 올리면서 복사본을 잊으면 워커와 래퍼의 메시지 규약이 어긋날 수 있다 —
 * 이 테스트가 그 드리프트를 빌드 전에 잡는다.
 */
const FILES = ["worker.js", "const.js", "errors.js"];
const root = resolve(__dirname, "../../../..");

describe("public/ffmpeg 워커 복사본", () => {
  for (const name of FILES) {
    it(`${name}은 설치된 @ffmpeg/ffmpeg dist/esm과 같다`, () => {
      const copied = readFileSync(resolve(root, "apps/admin/public/ffmpeg", name), "utf8");
      const installed = readFileSync(resolve(root, "node_modules/@ffmpeg/ffmpeg/dist/esm", name), "utf8");
      expect(copied).toBe(installed);
    });
  }
});
