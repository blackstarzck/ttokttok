import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { next: { rootDir: ["apps/client/", "apps/admin/"] } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts", ".tmp/**", "playwright-report/**", "test-results/**",
    // Verbatim copy of @ffmpeg/ffmpeg dist (worker.js, const.js, errors.js); guarded by ffmpeg-worker-copy.test.ts.
    "apps/admin/public/ffmpeg/**",
  ]),
]);

export default eslintConfig;
