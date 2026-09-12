import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("react-native-reanimated", () => import("./reanimated.stub"));

afterEach(() => {
  cleanup();
});
