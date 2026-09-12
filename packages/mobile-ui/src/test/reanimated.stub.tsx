import { useRef } from "react";

import { View } from "./react-native.stub";

interface TimingCall {
  target: number;
  duration?: number;
  finish?: (finished: boolean) => void;
}
export const motionTest: { calls: TimingCall[]; cancelled: number } = {
  calls: [],
  cancelled: 0
};
export function useSharedValue(initial: number) {
  return useRef({ value: initial }).current;
}
export function withTiming(
  target: number,
  config: { duration?: number },
  finish?: (finished: boolean) => void
) {
  motionTest.calls.push({ target, ...config, ...(finish ? { finish } : {}) });
  return target;
}
export function cancelAnimation() {
  motionTest.cancelled++;
}
export function useAnimatedStyle<T>(updater: () => T): T {
  return updater();
}
export function runOnJS(callback: () => void) {
  return callback;
}
export const Easing = { bezier: () => (value: number) => value };
export default { View };
