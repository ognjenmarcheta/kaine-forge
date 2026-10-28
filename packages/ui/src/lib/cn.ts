import { typeUtilities } from "@repo/theme";
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the theme utilities, so a later class replaces an earlier one:
// the type steps set font size, and every `ds-` spacing step is a spacing value.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [(value: string) => value.startsWith("ds-")]
    },
    classGroups: {
      "font-size": [{ text: Object.keys(typeUtilities) }]
    }
  }
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
