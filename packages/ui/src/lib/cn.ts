import { typeUtilities } from "@repo/theme";
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the theme utilities, so a later class replaces an earlier one:
// the type steps set font size, every `ds-` spacing step and the card padding (`p-card`) are
// spacing values, and the component radii and named shadows join the radius and shadow scales.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["badge", "button", "card", "dialog", "field", "overlay"],
      shadow: ["card", "floating", "floating-bold", "overlay", "raised"],
      spacing: [(value: string) => value.startsWith("ds-") || value === "card"]
    },
    classGroups: {
      "font-size": [{ text: Object.keys(typeUtilities) }]
    }
  }
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
