import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "heading-display",
            "heading-xxl",
            "heading-xl",
            "heading-lg",
            "heading-md",
            "heading-sm",
            "heading-xs",
            "heading-xxs",
            "body-lg",
            "body",
            "body-sm",
            "body-xs"
          ]
        }
      ]
    }
  }
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
