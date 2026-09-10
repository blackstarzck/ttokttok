import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        "./apps/client/tsconfig.json",
        "./apps/admin/tsconfig.json",
        "./packages/shared/tsconfig.json",
      ],
    }),
  ],
  test: {
    environment: "node",
    include: [
      "apps/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "tests/architecture/**/*.test.ts",
    ],
  },
});
