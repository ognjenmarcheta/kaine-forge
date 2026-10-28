import { Center, type OnCenterCallbackProps } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Spherical, Vector3, type DirectionalLight } from "three";

import "./viewport.elements";
import { easeView, type View } from "./viewport.view";

/** What the last frame drew, for tests and budgets. `frames` counts every frame drawn so far. */
export interface RenderStats {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly frames: number;
  /** True once no frame has been drawn for a moment. */
  readonly idle: boolean;
}

export interface ViewportCanvasProps {
  children: ReactNode;
  /** Shown inside the canvas element by a browser that has no canvas. */
  fallback: ReactNode;
  view: View;
  reducedMotion: boolean;
  onContextLost: () => void;
  onStats: (stats: RenderStats) => void;
}

const FIELD_OF_VIEW = 30;
const HALF_FIELD = (FIELD_OF_VIEW / 2) * (Math.PI / 180);
/** Room around the model when zoom is 1. */
const FIT_MARGIN = 1.06;
const IDLE_AFTER_MS = 300;
const MAX_FRAME_SECONDS = 1 / 30;
// The lights, as shares of a material's color. With `flat` rendering (no tone mapping), a face
// lit by a share of 1 shows its token color exactly. Every face gets the ambient share; faces
// turned to the key light beside the camera get up to the key share more. The ambient share
// sets the darkest shade: a lit color that is lighter than a kept (unlit) color and 4.3:1 from
// it keeps 3:1 on every face.
const AMBIENT_SHARE = 0.7;
const KEY_SHARE = 0.4;
// Three's lights are physical: a light of intensity π gives a Lambert face its full color.
const AMBIENT_INTENSITY = AMBIENT_SHARE * Math.PI;
const KEY_INTENSITY = KEY_SHARE * Math.PI;

/** The model's size around its center: its height, and its widest reach from the vertical axis. */
interface Bounds {
  height: number;
  reach: number;
}

/**
 * The camera distance at which the model fits the canvas from any side: its height in the
 * vertical field of view, and its reach, which turns into view as the model turns, in the
 * horizontal one. A tall canvas narrows the horizontal field, so the camera backs off.
 */
function fitDistance({ height, reach }: Bounds, aspect: number): number {
  const tanVertical = Math.tan(HALF_FIELD);
  const tanHorizontal = tanVertical * aspect;
  return Math.max(height / 2 / tanVertical, reach / tanHorizontal) + reach;
}

/**
 * Moves the camera around the model's center toward `view`, and keeps the key light beside
 * the camera so the side in view is lit. An animated move asks for frames until it settles;
 * with reduced motion the camera snaps.
 */
function CameraRig({
  bounds,
  reducedMotion,
  view
}: {
  bounds: Bounds;
  reducedMotion: boolean;
  view: View;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const light = useRef<DirectionalLight>(null);
  const shown = useRef<View | null>(null);
  const spherical = useMemo(() => new Spherical(), []);
  const keyOffset = useMemo(() => new Vector3(), []);
  const size = Math.max(bounds.height / 2, bounds.reach);
  const fit = fitDistance(bounds, aspect) * FIT_MARGIN;

  useEffect(() => {
    // Keep the whole model between the near and far planes, whatever its size.
    camera.near = size / 100;
    camera.far = size * 100;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size]);

  useEffect(() => {
    invalidate();
  }, [fit, invalidate, reducedMotion, view]);

  useFrame((_state, delta) => {
    // With frameloop "demand", the first frame after a pause reports the whole pause as its
    // delta, which would finish a move in one jump. Count at most one 30 Hz frame.
    const step = Math.min(delta, MAX_FRAME_SECONDS);
    const next = !shown.current || reducedMotion ? view : easeView(shown.current, view, step);
    shown.current = next;
    spherical.set(fit / next.zoom, next.polar, next.azimuth);
    camera.position.setFromSpherical(spherical);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // The key light sits above and to the right of the camera, so the side in view is lit and
    // the shading still shows the form.
    light.current?.position.copy(camera.localToWorld(keyOffset.set(size, size * 2, 0)));
    if (next !== view) invalidate();
  });

  return <directionalLight ref={light} intensity={KEY_INTENSITY} />;
}

/**
 * Writes what each frame drew. useFrame runs before the frame is drawn, so the counters are
 * read in a microtask, after the draw.
 */
function RenderStatsProbe({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  useFrame(() => {
    const report = (idle: boolean): void => {
      const { memory, render } = gl.info;
      onStats({
        calls: render.calls,
        triangles: render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
        frames: frames.current,
        idle
      });
    };
    frames.current += 1;
    queueMicrotask(() => report(false));
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => report(true), IDLE_AFTER_MS);
  });

  return null;
}

/** The model, centered on the origin, and the camera that orbits it. */
function Stage({
  children,
  reducedMotion,
  view
}: {
  children: ReactNode;
  reducedMotion: boolean;
  view: View;
}) {
  const [bounds, setBounds] = useState<Bounds>({ height: 1, reach: 1 });
  // Stable, and a no-op for the same size: Center measures again whenever this changes.
  const measure = useCallback(({ depth, height, width }: OnCenterCallbackProps) => {
    const reach = Math.hypot(width, depth) / 2;
    setBounds((current) =>
      current.height === height && current.reach === reach ? current : { height, reach }
    );
  }, []);

  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <CameraRig bounds={bounds} reducedMotion={reducedMotion} view={view} />
      <Center onCentered={measure}>{children}</Center>
    </>
  );
}

/**
 * The canvas and everything that needs three.js. Viewport3D loads this module lazily, so three
 * and React Three Fiber land in their own chunk.
 */
export default function ViewportCanvas({
  children,
  fallback,
  onContextLost,
  onStats,
  reducedMotion,
  view
}: ViewportCanvasProps) {
  return (
    <Canvas
      camera={{ fov: FIELD_OF_VIEW }}
      dpr={[1, 2]}
      fallback={fallback}
      flat
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener(
          "webglcontextlost",
          (event) => {
            // Without preventDefault the browser never offers the context back.
            event.preventDefault();
            onContextLost();
          },
          { once: true }
        );
      }}
    >
      <RenderStatsProbe onStats={onStats} />
      <Stage reducedMotion={reducedMotion} view={view}>
        {children}
      </Stage>
    </Canvas>
  );
}
