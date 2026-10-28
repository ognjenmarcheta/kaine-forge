// Plain text, never regex syntax: template adoption rewrites it to any product name.
const APP_NAME = "Kaine Forge";

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const textOrKey = (text: string, key: string): string =>
  `(${escapeRegExp(text)}|${escapeRegExp(key)})`;

/** The `<page> · <app>` document title, translated or as raw keys when translations are missing. */
export function documentTitle(page: string, pageKey: string): RegExp {
  return new RegExp(`^${textOrKey(page, pageKey)} · ${textOrKey(APP_NAME, "common.appName")}$`);
}
