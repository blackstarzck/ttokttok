import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stablePage } from "./helpers";

export const capturingLegacy = process.env.CAPTURE_LEGACY_BASELINE === "1";
export const legacyUrl = capturingLegacy ? "http://localhost:3100" : undefined;

export async function snapshot(page: Page, info: TestInfo, name: string) {
  await stablePage(page);
  if (capturingLegacy) {
    if (
      new URL(page.url()).port !== "3100" ||
      !existsSync(".tmp/monorepo-baseline/src/app/admin")
    ) {
      throw new Error(
        "Baseline capture requires the preserved pre-migration app on port 3100",
      );
    }
    const target = path.join(
      "e2e",
      "baselines",
      info.project.name,
      `${name}.png`,
    );
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      await page.screenshot({ animations: "disabled", fullPage: false }),
    );
  } else {
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
  }
}
