import {
  Button,
  ChevronRight,
  cn,
  Minus,
  Plus,
  RotateCcw,
  Skeleton,
  useMediaQuery
} from "@repo/ui";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

import type { RenderStats } from "./viewport.scene";
import {
  applyViewAction,
  ROTATE_STEP,
  TILT_STEP,
  viewCommandForKey,
  ZOOM_STEP,
  type View,
  type ViewAction,
  type ViewConfig
} from "./viewport.view";
import { supportsWebGL2 } from "./viewport.webgl";

// three.js and React Three Fiber load with the canvas, in their own chunk.
const ViewportCanvas = lazy(() => import("./viewport.scene"));

/** Radians the model turns per pixel dragged. */
const DRAG_SPEED = 0.01;

/** Translated text of the viewer. The package holds no strings of its own. */
export interface Viewport3DLabels {
  /** The viewer's accessible name, such as "Body model". */
  viewer: string;
  /** How to use the keyboard. Screen readers read it as the viewer's description. */
  keyboardHelp: string;
  /** The name of the button group. */
  controls: string;
  rotateLeft: string;
  rotateRight: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
}

/** Lets the person tilt the model up and down, with these limits from straight above. */
export interface Viewport3DTilt {
  labels: { up: string; down: string };
  /** Radians from straight above. Defaults: 0.35π and 0.65π. */
  min?: number;
  max?: number;
}

export interface Viewport3DProps {
  /**
   * The scene: React Three Fiber elements. Load the component that draws it with React.lazy,
   * so three.js stays out of the page's own chunk.
   */
  children: ReactNode;
  labels: Viewport3DLabels;
  /**
   * Shown in place of the viewer when the browser has no WebGL2, the GPU drops the context, or
   * the scene fails. Make it useful: a poster, or a pointer to the list beside the viewer.
   */
  fallback: ReactNode;
  /** Read out politely when it changes, such as "Left forearm selected". */
  announcement?: string;
  /** Escape calls it. Without it, Escape is left to the page. */
  onClearSelection?: () => void;
  tilt?: Viewport3DTilt;
  /** Zoom 1 fits the model. Defaults: 0.75 to 3. */
  zoom?: { min: number; max: number };
  /** The start view. Azimuth 0 faces the model's front. */
  initialView?: Partial<View>;
  className?: string;
}

type Status = "ready" | "unsupported" | "lost" | "failed";

/** A view button: the alternative to dragging (WCAG 2.2 SC 2.5.7). */
interface ControlButton {
  label: string;
  action: ViewAction;
  icon: ReactNode;
}

/** Turns a scene error into the fallback instead of an error page. */
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function viewConfig(
  tilt: Viewport3DTilt | undefined,
  zoom: Viewport3DProps["zoom"],
  initialView: Partial<View> | undefined
): ViewConfig {
  const level = Math.PI / 2;
  return {
    initial: { azimuth: 0, polar: level, zoom: 1, ...initialView },
    minPolar: tilt ? (tilt.min ?? 0.35 * Math.PI) : (initialView?.polar ?? level),
    maxPolar: tilt ? (tilt.max ?? 0.65 * Math.PI) : (initialView?.polar ?? level),
    minZoom: zoom?.min ?? 0.75,
    maxZoom: zoom?.max ?? 3
  };
}

/**
 * A 3D view that a DOM control drives. The canvas is hidden from assistive technology: keep
 * the data and the selection in React and in a real control beside the viewer, and let the
 * scene mirror them. The viewer itself takes focus: arrow keys turn the model, + and - zoom,
 * Home resets, and Escape clears the selection. Buttons do the same for pointer users who
 * cannot drag. It draws only when something changes, and shows `fallback` when it cannot draw.
 */
export function Viewport3D({
  announcement,
  children,
  className,
  fallback,
  initialView,
  labels,
  onClearSelection,
  tilt,
  zoom
}: Viewport3DProps) {
  const helpId = useId();
  const viewer = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [status, setStatus] = useState<Status>(() => (supportsWebGL2() ? "ready" : "unsupported"));
  const config = viewConfig(tilt, zoom, initialView);
  const [view, dispatch] = useReducer(
    (current: View, action: ViewAction) => applyViewAction(current, action, config),
    config.initial
  );

  const writeStats = useCallback((stats: RenderStats) => {
    // A data attribute, not state: writing it must not draw another frame.
    viewer.current?.setAttribute("data-render-stats", JSON.stringify(stats));
  }, []);
  const loseContext = useCallback(() => setStatus("lost"), []);
  const fail = useCallback(() => setStatus("failed"), []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const command = viewCommandForKey(event.key, tilt !== undefined);
    if (!command) return;
    if (command.type === "clear") {
      if (!onClearSelection) return;
      onClearSelection();
    } else {
      dispatch(command);
    }
    event.preventDefault();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const { pointerId } = event;
    let lastX = event.clientX;
    let lastY = event.clientY;
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return;
      dispatch({
        type: "rotate",
        azimuth: -(next.clientX - lastX) * DRAG_SPEED,
        polar: tilt ? -(next.clientY - lastY) * DRAG_SPEED : 0
      });
      lastX = next.clientX;
      lastY = next.clientY;
    };
    // Window listeners, not pointer capture: capture would retarget the click the scene's
    // own pointer events need.
    const end = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const tiltButtons: ControlButton[] = tilt
    ? [
        {
          label: tilt.labels.up,
          action: { type: "rotate", azimuth: 0, polar: -TILT_STEP },
          icon: <ChevronRight aria-hidden className="size-ds-250 -rotate-90" />
        },
        {
          label: tilt.labels.down,
          action: { type: "rotate", azimuth: 0, polar: TILT_STEP },
          icon: <ChevronRight aria-hidden className="size-ds-250 rotate-90" />
        }
      ]
    : [];
  const buttons: ControlButton[] = [
    {
      label: labels.rotateLeft,
      action: { type: "rotate", azimuth: ROTATE_STEP, polar: 0 },
      icon: <ChevronRight aria-hidden className="size-ds-250 rotate-180" />
    },
    {
      label: labels.rotateRight,
      action: { type: "rotate", azimuth: -ROTATE_STEP, polar: 0 },
      icon: <ChevronRight aria-hidden className="size-ds-250" />
    },
    ...tiltButtons,
    {
      label: labels.zoomIn,
      action: { type: "zoom", factor: ZOOM_STEP },
      icon: <Plus aria-hidden className="size-ds-250" />
    },
    {
      label: labels.zoomOut,
      action: { type: "zoom", factor: 1 / ZOOM_STEP },
      icon: <Minus aria-hidden className="size-ds-250" />
    },
    {
      label: labels.reset,
      action: { type: "reset" },
      icon: <RotateCcw aria-hidden className="size-ds-250" />
    }
  ];

  return (
    <div className={cn("relative", className)}>
      {status === "ready" ? (
        <div
          ref={viewer}
          aria-describedby={helpId}
          aria-label={labels.viewer}
          className="relative size-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-border-focused"
          role="region"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {/* touch-action sits on the canvas only, so the controls and the page still scroll.
              Without tilt a vertical swipe scrolls the page and a sideways drag turns the model. */}
          <div
            aria-hidden
            className={cn("size-full cursor-grab", tilt ? "touch-none" : "touch-pan-y")}
            onPointerDown={onPointerDown}
          >
            <SceneBoundary onError={fail}>
              <Suspense fallback={<Skeleton className="size-full rounded-lg" />}>
                <ViewportCanvas
                  fallback={fallback}
                  reducedMotion={reducedMotion}
                  view={view}
                  onContextLost={loseContext}
                  onStats={writeStats}
                >
                  {children}
                </ViewportCanvas>
              </Suspense>
            </SceneBoundary>
          </div>
          <div
            aria-label={labels.controls}
            className="absolute bottom-ds-150 start-ds-150 flex flex-col gap-ds-100"
            role="group"
          >
            {buttons.map(({ action, icon, label }) => (
              <Button
                key={label}
                appearance="raised"
                aria-label={label}
                className="rounded-full"
                spacing="icon"
                type="button"
                onClick={() => dispatch(action)}
              >
                {icon}
              </Button>
            ))}
          </div>
          <p className="sr-only" id={helpId}>
            {labels.keyboardHelp}
          </p>
        </div>
      ) : (
        fallback
      )}
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
