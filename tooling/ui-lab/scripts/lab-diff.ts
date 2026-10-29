/**
 * How far each recreated screen still is from its reference, as one number.
 * Start the lab first (pnpm lab), then run pnpm lab:diff [id ...]. LAB_URL overrides the address.
 *
 * Each screen renders at its frame size in its reference mode. The reference (its
 * referenceCrop, or the whole image) is scaled to the frame width. Both become gray, and a
 * pixel differs when the two gray values are more than 40 apart. The script prints the share of
 * differing pixels and writes shots/<id>.diffmap.png: the recreation, dimmed, with the differing
 * pixels in red. The number means something only when the crop lines the two up.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.env["LAB_URL"] ?? "http://localhost:5180";
const out = fileURLToPath(new URL("../shots/", import.meta.url));
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const asJson = process.argv.includes("--json");
const THRESHOLD = 40;

mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
// tsx keeps function names with an __name helper, which the page does not have.
await page.addInitScript({ content: "window.__name = (target) => target;" });
await page.goto(`${base}/#/`);
await page.waitForFunction(() => window.labScreens !== undefined);
const screens = await page.evaluate(() => window.labScreens ?? []);
const results: { id: string; differing: number; crop: boolean }[] = [];

for (const screen of screens.filter((entry) => only.length === 0 || only.includes(entry.id))) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: screen.width, height: screen.height });
  await page.goto(`${base}/#/screens/${screen.id}/${screen.mode}`);
  // A dev server never goes network-idle, so wait for the load event and the lazy charts.
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  const shot = (await page.screenshot()).toString("base64");

  const result = await page.evaluate(
    async ({ shot, screen, threshold }) => {
      const load = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Cannot load ${src}`));
          image.src = src;
        });
      const [recreation, reference] = await Promise.all([
        load(`data:image/png;base64,${shot}`),
        load(`/references/${screen.reference}`)
      ]);
      const { width, height } = screen;
      const crop = screen.referenceCrop ?? {
        x: 0,
        y: 0,
        width: reference.naturalWidth,
        height: reference.naturalHeight
      };
      const canvas = (draw: (context: CanvasRenderingContext2D) => void): ImageData => {
        const element = document.createElement("canvas");
        element.width = width;
        element.height = height;
        const context = element.getContext("2d");
        if (!context) throw new Error("No 2D canvas");
        context.fillStyle = "#808080";
        context.fillRect(0, 0, width, height);
        draw(context);
        return context.getImageData(0, 0, width, height);
      };
      const scale = width / crop.width;
      const a = canvas((context) =>
        context.drawImage(
          reference,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          width,
          crop.height * scale
        )
      );
      const b = canvas((context) => context.drawImage(recreation, 0, 0));
      const map = new ImageData(width, height);
      const gray = (data: Uint8ClampedArray, index: number): number =>
        0.299 * (data[index] ?? 0) +
        0.587 * (data[index + 1] ?? 0) +
        0.114 * (data[index + 2] ?? 0);
      let differing = 0;
      for (let index = 0; index < a.data.length; index += 4) {
        const recreated = gray(b.data, index);
        const differs = Math.abs(gray(a.data, index) - recreated) > threshold;
        if (differs) differing += 1;
        map.data[index] = differs ? 230 : recreated * 0.35;
        map.data[index + 1] = differs ? 40 : recreated * 0.35;
        map.data[index + 2] = differs ? 40 : recreated * 0.35;
        map.data[index + 3] = 255;
      }
      const element = document.createElement("canvas");
      element.width = width;
      element.height = height;
      element.getContext("2d")?.putImageData(map, 0, 0);
      return {
        differing: (differing / (width * height)) * 100,
        map: element.toDataURL("image/png").split(",")[1] ?? ""
      };
    },
    { shot, screen, threshold: THRESHOLD }
  );

  writeFileSync(`${out}${screen.id}.diffmap.png`, Buffer.from(result.map, "base64"));
  results.push({
    id: screen.id,
    differing: Math.round(result.differing * 10) / 10,
    crop: screen.referenceCrop !== undefined
  });
  if (!asJson) {
    console.log(
      `${screen.id.padEnd(24)} ${result.differing.toFixed(1).padStart(5)}% differ${screen.referenceCrop ? "" : "  (no referenceCrop: the whole image is compared)"}`
    );
  }
}

if (asJson) console.log(JSON.stringify(results, null, 2));
await browser.close();
