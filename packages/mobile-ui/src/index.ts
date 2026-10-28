/// <reference types="nativewind/types" />

export * from "./components/primitives/avatar";
export * from "./components/primitives/badge";
export * from "./components/primitives/button";
export * from "./components/primitives/card";
export * from "./components/primitives/checkbox";
export * from "./components/primitives/dialog";
export * from "./components/primitives/input";
export * from "./components/primitives/separator";
export * from "./components/primitives/skeleton";
export * from "./components/primitives/text";
export * from "./components/primitives/theme-root";
export * from "./lib/cn";
export * from "./lib/fonts";
export * from "./lib/variants";

export {
  defaultThemeName,
  nativeThemeFonts,
  motionDurations,
  motionEasing,
  motionDistances,
  motionPressScale
} from "./lib/design-tokens";
export { useReducedMotion } from "./hooks/use-reduced-motion";
