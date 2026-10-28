/**
 * Screenshots every recreated screen and its side-by-side comparison into shots/.
 * Start the lab first (pnpm lab), then run pnpm lab:shots. LAB_URL overrides the address.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.env["LAB_URL"] ?? "http://localhost:5180";
const out = fileURLToPath(new URL("../shots/", import.meta.url));
const only = process.argv.slice(2);

mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/#/`);
const screens = await page.evaluate(() => window.labScreens ?? []);

for (const screen of screens.filter((entry) => only.length === 0 || only.includes(entry.id))) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const mode of ["light", "dark"] as const) {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto(`${base}/#/screens/${screen.id}/${mode}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${out}${screen.id}.${mode}.png` });
  }
  await page.setViewportSize({ width: screen.width * 2 + 64, height: screen.height + 96 });
  await page.goto(`${base}/#/compare/${screen.id}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}${screen.id}.compare.png`, fullPage: true });
  console.log(`shot ${screen.id}`);
}

await browser.close();
