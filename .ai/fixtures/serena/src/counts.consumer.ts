import { clampCount } from "./index.ts";

export function countForDisplay(count: number): number {
  return clampCount(count);
}
