import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * 이 저장소의 테스트는 순수 함수만 대상으로 한다 (계획의 Global Constraints).
 * Supabase 쿼리 빌더를 모킹한 테스트는 모킹한 모양을 검증할 뿐이라 만들지
 * 않는다 — 네트워크가 필요한 경로와 렌더는 npm run build와 375px 수동
 * 확인이 맡는다 (FRONTEND.md §7).
 *
 * 그래서 환경은 jsdom이 아니라 node다. jsdom을 켜면 "렌더도 테스트할 수
 * 있다"는 착시가 생기고, 그 순간 위 경계가 무너진다.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
