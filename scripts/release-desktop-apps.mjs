import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * The desktop apps whose GitHub Release carries installers instead of a container
 * image (ADR 0025), and the workspace whose `bundle` script builds them.
 */
export const DESKTOP_APPS = [{ app: "desktop", workspace: "@repo/desktop" }];

/**
 * The installer matrix for the tags at HEAD: one entry per tagged desktop app.
 * @param {string} tags `git tag --points-at HEAD` output
 * @returns {{ app: string, workspace: string, version: string, tag: string }[]}
 */
export function desktopInstallers(tags) {
  return tags.split("\n").flatMap((tag) => {
    const match = /^@repo\/([a-z0-9-]+)@(.+)$/.exec(tag.trim());
    const entry = match && DESKTOP_APPS.find(({ app }) => app === match[1]);
    return entry ? [{ ...entry, version: match[2], tag: tag.trim() }] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`matrix=${JSON.stringify(desktopInstallers(readFileSync(0, "utf8")))}\n`);
}
