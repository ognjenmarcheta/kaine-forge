/** Where the camera sits around the model. Angles are in radians. */
export interface View {
  /** Turn around the vertical axis. 0 looks at the model's front. */
  readonly azimuth: number;
  /** Angle from straight above. π/2 is level with the model's center. */
  readonly polar: number;
  /** 1 fits the whole model in the viewer; 2 shows it twice as large. */
  readonly zoom: number;
}

export interface ViewConfig {
  /** The view on mount, and the view that Home and the reset button return to. */
  readonly initial: View;
  readonly minPolar: number;
  readonly maxPolar: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

export type ViewAction =
  /** Turns the camera by these amounts. A negative azimuth turns the model to the right. */
  | { readonly type: "rotate"; readonly azimuth: number; readonly polar: number }
  | { readonly type: "zoom"; readonly factor: number }
  | { readonly type: "reset" };

/** A view change, or `clear`: the person asked to clear the selection (Escape). */
export type ViewCommand = ViewAction | { readonly type: "clear" };

/** One key press or button press turns the model by 15° and tilts it by 10°. */
export const ROTATE_STEP = Math.PI / 12;
export const TILT_STEP = Math.PI / 18;
export const ZOOM_STEP = 1.25;
/** How fast an animated camera move closes the gap, per second. */
const EASE_RATE = 10;
const SETTLED = 1e-3;
const TURN = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function applyViewAction(view: View, action: ViewAction, config: ViewConfig): View {
  switch (action.type) {
    case "rotate":
      return {
        ...view,
        azimuth: view.azimuth + action.azimuth,
        polar: clamp(view.polar + action.polar, config.minPolar, config.maxPolar)
      };
    case "zoom":
      return { ...view, zoom: clamp(view.zoom * action.factor, config.minZoom, config.maxZoom) };
    case "reset": {
      // Turn back the short way: to the start angle nearest the current one, not back
      // through every full turn the person made.
      const turns = Math.round((view.azimuth - config.initial.azimuth) / TURN);
      return { ...config.initial, azimuth: config.initial.azimuth + turns * TURN };
    }
  }
}

/**
 * The view command for a key, or null when the viewer leaves the key to the page. Arrow keys
 * turn the model, + and - zoom, Home resets, and Escape asks to clear the selection. Up and
 * Down tilt only when the viewer allows tilt; otherwise they keep scrolling the page.
 */
export function viewCommandForKey(key: string, tilt: boolean): ViewCommand | null {
  switch (key) {
    case "ArrowLeft":
      return { type: "rotate", azimuth: ROTATE_STEP, polar: 0 };
    case "ArrowRight":
      return { type: "rotate", azimuth: -ROTATE_STEP, polar: 0 };
    case "ArrowUp":
      return tilt ? { type: "rotate", azimuth: 0, polar: -TILT_STEP } : null;
    case "ArrowDown":
      return tilt ? { type: "rotate", azimuth: 0, polar: TILT_STEP } : null;
    case "+":
    case "=":
      return { type: "zoom", factor: ZOOM_STEP };
    case "-":
    case "_":
      return { type: "zoom", factor: 1 / ZOOM_STEP };
    case "Home":
      return { type: "reset" };
    case "Escape":
      return { type: "clear" };
    default:
      return null;
  }
}

/**
 * Moves the shown view toward the target by the time that passed, so a camera move takes the
 * same time at 60 Hz and at 120 Hz. Returns the target itself once the gap is too small to see.
 */
export function easeView(shown: View, target: View, delta: number): View {
  const share = 1 - Math.exp(-EASE_RATE * delta);
  const next: View = {
    azimuth: shown.azimuth + (target.azimuth - shown.azimuth) * share,
    polar: shown.polar + (target.polar - shown.polar) * share,
    zoom: shown.zoom + (target.zoom - shown.zoom) * share
  };
  const settled =
    Math.abs(target.azimuth - next.azimuth) < SETTLED &&
    Math.abs(target.polar - next.polar) < SETTLED &&
    Math.abs(target.zoom - next.zoom) < SETTLED;
  return settled ? target : next;
}
