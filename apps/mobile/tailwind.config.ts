import preset from "@repo/config/tailwind/preset";
import nativewindPreset from "nativewind/dist/tailwind/index.js";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  presets: [nativewindPreset, preset]
};
