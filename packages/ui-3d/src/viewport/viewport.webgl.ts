/**
 * Whether this browser can draw the 3D view. Call it before you mount a canvas: it creates one
 * WebGL2 context and releases it at once, because a page may hold only a few contexts.
 */
export function supportsWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    // Some browsers throw instead of returning null when WebGL is blocked.
    return false;
  }
}
