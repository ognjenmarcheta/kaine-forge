import type { ReactNode } from "react";

// Test-only stand-in for react-native-svg, wired up through the vitest resolve alias.
// Charts draw nothing here; their accessible View around the drawing is what tests read.
function Shape({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export default Shape;
export { Shape as Circle, Shape as G, Shape as Line, Shape as Rect };
