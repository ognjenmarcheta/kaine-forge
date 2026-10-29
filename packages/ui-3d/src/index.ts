// The DOM side of the 3D viewer. Nothing here imports three.js: Viewport3D loads the canvas,
// three, and React Three Fiber lazily, in their own chunk. Code that runs inside the scene
// imports from "@repo/ui-3d/scene".
export {
  Viewport3D,
  type Viewport3DLabels,
  type Viewport3DProps,
  type Viewport3DTilt
} from "./viewport/viewport.component";
export type { RenderStats } from "./viewport/viewport.scene";
export type { View } from "./viewport/viewport.view";
export { supportsWebGL2 } from "./viewport/viewport.webgl";
