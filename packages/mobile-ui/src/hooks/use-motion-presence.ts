import { useEffect, useRef, useState } from "react";
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { motionDurations, motionEasing } from "../lib/design-tokens";

/** Keep an exiting native modal mounted; a reopened modal owns a new completion. */
export function useMotionPresence(isOpen: boolean, immediate: boolean) {
  const [present, setPresent] = useState(isOpen);
  const progress = useSharedValue(0);
  const revision = useRef(0);

  useEffect(() => {
    const current = ++revision.current;
    cancelAnimation(progress);
    if (isOpen) setPresent(true);
    const finish = () => {
      if (revision.current === current && !isOpen) setPresent(false);
    };
    if (immediate) {
      progress.value = isOpen ? 1 : 0;
      finish();
    } else {
      progress.value = withTiming(
        isOpen ? 1 : 0,
        {
          duration: motionDurations.overlay,
          easing: Easing.bezier(...motionEasing)
        },
        (finished) => {
          if (finished) runOnJS(finish)();
        }
      );
    }
    return () => {
      revision.current++;
      cancelAnimation(progress);
    };
  }, [immediate, isOpen, progress]);

  return { visible: isOpen || present, progress };
}
