import preset from "../../packages/config/tailwind/preset.js";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  presets: [preset]
};
