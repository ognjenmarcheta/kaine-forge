import { translationInstance } from "./translation.config";

export function t(key: string): string {
  return translationInstance.t(key);
}

export async function changeLanguage(language: string): Promise<void> {
  await translationInstance.changeLanguage(language);
}
