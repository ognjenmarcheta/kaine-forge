import {
  Button,
  cn,
  CopyButton,
  Input,
  Label,
  Modal,
  SegmentedControl,
  SegmentedControlItem,
  Slider
} from "@repo/ui";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from "react";

import type { LabCatalog, LabCrop, LabScreen } from "./lab.registry";

type CompareMode = "side" | "slider" | "overlay";
type Axis = "x" | "y";
type ColorMode = "light" | "dark";

const CROP_FIELDS = ["x", "y", "width", "height"] as const;
const cropKey = (id: string): string => `kaine.lab.crop.${id}`;

/** The saved alignment of a screen's reference, or its own `referenceCrop`. */
function readCrop(screen: LabScreen): LabCrop | undefined {
  try {
    const values = (localStorage.getItem(cropKey(screen.id)) ?? "").split(",").map(Number);
    const [x = 0, y = 0, width = 0, height = 0] = values;
    if (values.length === 4 && values.every(Number.isFinite) && width > 0 && height > 0) {
      return { x, y, width, height };
    }
  } catch {
    // Storage can be blocked; the screen's own crop still applies.
  }
  return screen.referenceCrop;
}

function writeCrop(id: string, crop: LabCrop | undefined): void {
  try {
    if (crop)
      localStorage.setItem(cropKey(id), [crop.x, crop.y, crop.width, crop.height].join(","));
    else localStorage.removeItem(cropKey(id));
  } catch {
    // Alignment is a convenience; the view works without storage.
  }
}

/** Scales a fixed-size frame down to the width its container gives it, never up. */
function FitFrame({
  width,
  height,
  children
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, (entry?.contentRect.width ?? width) / width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={host} className="w-full min-w-0" data-compare-frame="">
      <div
        className="relative overflow-hidden rounded-md border border-ds-border bg-ds-bg"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="absolute left-0 top-0"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The reference, with its crop scaled to the frame width; without a crop, the whole image. */
function ReferenceImage({
  screen,
  crop,
  alt
}: {
  screen: LabScreen;
  crop: LabCrop | undefined;
  alt: string;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const region = crop ?? (natural ? { x: 0, y: 0, ...natural } : null);
  const scale = region ? screen.width / region.width : 1;

  return (
    <div className="absolute inset-0 overflow-hidden bg-ds-surface-sunken">
      <img
        alt={alt}
        className="absolute max-w-none select-none"
        draggable={false}
        src={`/references/${screen.reference}`}
        style={
          natural && region
            ? {
                width: natural.width * scale,
                height: natural.height * scale,
                left: -region.x * scale,
                top: -region.y * scale
              }
            : { width: "100%" }
        }
        onLoad={(event) =>
          setNatural({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight
          })
        }
      />
    </div>
  );
}

function Recreation({ screen, colorMode }: { screen: LabScreen; colorMode: ColorMode }) {
  return (
    <iframe
      className="absolute inset-0 block size-full border-0 bg-ds-bg"
      src={`#/screens/${screen.id}/${colorMode}`}
      title={`Recreation of ${screen.title}`}
    />
  );
}

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute rounded-badge bg-ds-surface-inverse px-ds-100 py-ds-025 text-body-xs font-medium text-ds-text-surface-inverse",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Reference over recreation, split by a divider that a pointer drags and the arrow keys move. */
function SliderCompare({
  screen,
  crop,
  axis,
  colorMode
}: {
  screen: LabScreen;
  crop: LabCrop | undefined;
  axis: Axis;
  colorMode: ColorMode;
}) {
  const [position, setPosition] = useState(50);
  const surface = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const clamp = (value: number): number => Math.min(100, Math.max(0, value));

  const moveTo = (event: PointerEvent<HTMLDivElement>): void => {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return;
    const ratio =
      axis === "x"
        ? (event.clientX - box.left) / box.width
        : (event.clientY - box.top) / box.height;
    setPosition(Math.round(clamp(ratio * 100) * 10) / 10);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, number> = {
      ArrowLeft: -step,
      ArrowUp: -step,
      ArrowRight: step,
      ArrowDown: step,
      PageUp: -10,
      PageDown: 10
    };
    if (event.key === "Home") setPosition(0);
    else if (event.key === "End") setPosition(100);
    else if (event.key in moves) setPosition((value) => clamp(value + (moves[event.key] ?? 0)));
    else return;
    event.preventDefault();
  };
  const clip = axis === "x" ? `inset(0 ${100 - position}% 0 0)` : `inset(0 0 ${100 - position}% 0)`;

  return (
    <div
      ref={surface}
      className={cn(
        "absolute inset-0 touch-none select-none",
        axis === "x" ? "cursor-ew-resize" : "cursor-ns-resize"
      )}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      {/* The divider takes the pointer, so the recreation does not react while it is dragged. */}
      <div className="pointer-events-none absolute inset-0">
        <Recreation colorMode={colorMode} screen={screen} />
      </div>
      <div className="absolute inset-0" style={{ clipPath: clip }}>
        <ReferenceImage alt="" crop={crop} screen={screen} />
      </div>
      <Tag className="left-ds-150 top-ds-150">Reference</Tag>
      <Tag className="bottom-ds-150 right-ds-150">Recreation</Tag>
      <div
        aria-label="Divider between the reference and the recreation"
        aria-orientation={axis === "x" ? "horizontal" : "vertical"}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={position}
        aria-valuetext={`${position}% reference`}
        className={cn(
          "absolute z-10 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-border-focused",
          axis === "x"
            ? "inset-y-0 w-ds-300 -translate-x-1/2"
            : "inset-x-0 h-ds-300 -translate-y-1/2"
        )}
        role="slider"
        style={axis === "x" ? { left: `${position}%` } : { top: `${position}%` }}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute bg-ds-border-focused",
            axis === "x" ? "inset-y-0 w-ds-025" : "inset-x-0 h-ds-025"
          )}
        />
        <span
          aria-hidden="true"
          className="relative size-ds-300 rounded-full border-2 border-ds-border-focused bg-ds-surface shadow-overlay"
        />
      </div>
    </div>
  );
}

/** The reference over the recreation with an opacity, or as a difference that turns matches black. */
function OverlayCompare({
  screen,
  crop,
  colorMode,
  opacity,
  difference
}: {
  screen: LabScreen;
  crop: LabCrop | undefined;
  colorMode: ColorMode;
  opacity: number;
  difference: boolean;
}) {
  return (
    <div className="absolute inset-0">
      <Recreation colorMode={colorMode} screen={screen} />
      <div
        className={cn("pointer-events-none absolute inset-0", difference && "mix-blend-difference")}
        style={{ opacity: difference ? 1 : opacity / 100 }}
      >
        <ReferenceImage alt="" crop={crop} screen={screen} />
      </div>
    </div>
  );
}

/** Numbers for the reference crop, saved per screen, with the line to paste into the screen file. */
function AlignPanel({
  screen,
  crop,
  onChange
}: {
  screen: LabScreen;
  crop: LabCrop | undefined;
  onChange: (crop: LabCrop | undefined) => void;
}) {
  const id = useId();
  const value = crop ?? { x: 0, y: 0, width: screen.width, height: screen.height };
  const snippet = `referenceCrop: { x: ${value.x}, y: ${value.y}, width: ${value.width}, height: ${value.height} },`;

  return (
    <details className="rounded-md border border-ds-border bg-ds-surface-raised px-ds-200 py-ds-150">
      <summary className="cursor-pointer text-body-sm font-medium">Align reference</summary>
      <div className="grid gap-ds-150 pt-ds-150">
        <p className="m-0 text-body-sm text-ds-text-subtle">
          The part of the reference image that shows the app, in the image&apos;s pixels. Use the
          overlay with Difference to line it up, then paste the line into the screen file.
        </p>
        <div className="grid grid-cols-2 gap-ds-150 sm:grid-cols-4">
          {CROP_FIELDS.map((field) => (
            <div key={field} className="grid gap-ds-050">
              <Label htmlFor={`${id}-${field}`}>{field}</Label>
              <Input
                id={`${id}-${field}`}
                inputMode="numeric"
                type="number"
                value={value[field]}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) onChange({ ...value, [field]: next });
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-ds-100">
          <code className="min-w-0 flex-1 break-all rounded-sm bg-ds-surface-sunken px-ds-100 py-ds-050 text-body-xs">
            {snippet}
          </code>
          <CopyButton copiedLabel="Copied" label="Copy line" value={snippet} />
          <Button appearance="subtle" spacing="compact" onClick={() => onChange(undefined)}>
            Reset
          </Button>
        </div>
      </div>
    </details>
  );
}

/** The reference and the recreation side by side, as a divider slider, or as an overlay. */
export function CompareView({
  screen,
  catalog,
  view = ""
}: {
  screen: LabScreen;
  catalog: LabCatalog;
  /** The route's mode: "slider", "overlay", or "difference"; anything else is side by side. */
  view?: string;
}) {
  const [mode, setMode] = useState<CompareMode>(() =>
    view === "slider" ? "slider" : view === "overlay" || view === "difference" ? "overlay" : "side"
  );
  const [axis, setAxis] = useState<Axis>("x");
  const [colorMode, setColorMode] = useState<ColorMode>(screen.mode);
  const [opacity, setOpacity] = useState(50);
  const [difference, setDifference] = useState(view === "difference");
  const [crop, setCrop] = useState<LabCrop | undefined>(() => readCrop(screen));
  const [enlarged, setEnlarged] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const opacityId = useId();

  useEffect(() => setCrop(readCrop(screen)), [screen]);

  const index = catalog.screens.findIndex((entry) => entry.id === screen.id);
  const previous = catalog.screens[index - 1];
  const next = catalog.screens[index + 1];
  const updateCrop = (value: LabCrop | undefined): void => {
    setCrop(value);
    writeCrop(screen.id, value);
  };

  return (
    <div className="min-h-screen bg-ds-surface-sunken text-ds-text">
      <header className="sticky top-0 z-20 grid gap-ds-150 border-b border-ds-border bg-ds-surface px-ds-300 py-ds-150">
        <div className="flex flex-wrap items-center gap-ds-150">
          <a className="text-body-sm text-ds-link" href="#/screens">
            All screens
          </a>
          <h1 className="m-0 mr-auto text-heading-sm">{screen.title}</h1>
          <span className="text-body-sm text-ds-text-subtle">{`${screen.id} · ${screen.width} × ${screen.height}`}</span>
          <nav aria-label="Other screens" className="flex gap-ds-050">
            {previous ? (
              <Button asChild appearance="subtle" spacing="compact">
                <a href={`#/compare/${previous.id}`}>
                  <ChevronLeft aria-hidden className="size-ds-200" />
                  {previous.id}
                </a>
              </Button>
            ) : null}
            {next ? (
              <Button asChild appearance="subtle" spacing="compact">
                <a href={`#/compare/${next.id}`}>
                  {next.id}
                  <ChevronRight aria-hidden className="size-ds-200" />
                </a>
              </Button>
            ) : null}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-ds-200">
          <SegmentedControl
            aria-label="Compare mode"
            value={mode}
            onValueChange={(value) => {
              if (value === "side" || value === "slider" || value === "overlay") setMode(value);
            }}
          >
            <SegmentedControlItem value="side">Side by side</SegmentedControlItem>
            <SegmentedControlItem value="slider">Slider</SegmentedControlItem>
            <SegmentedControlItem value="overlay">Overlay</SegmentedControlItem>
          </SegmentedControl>
          {mode === "slider" ? (
            <SegmentedControl
              aria-label="Divider direction"
              value={axis}
              onValueChange={(value) => {
                if (value === "x" || value === "y") setAxis(value);
              }}
            >
              <SegmentedControlItem value="x">Vertical line</SegmentedControlItem>
              <SegmentedControlItem value="y">Horizontal line</SegmentedControlItem>
            </SegmentedControl>
          ) : null}
          {mode === "overlay" ? (
            <>
              <SegmentedControl
                aria-label="Blend"
                value={difference ? "difference" : "normal"}
                onValueChange={(value) => setDifference(value === "difference")}
              >
                <SegmentedControlItem value="normal">Opacity</SegmentedControlItem>
                <SegmentedControlItem value="difference">Difference</SegmentedControlItem>
              </SegmentedControl>
              {difference ? null : (
                <div className="flex w-56 items-center gap-ds-100">
                  <span className="text-body-sm text-ds-text-subtle" id={opacityId}>
                    Reference
                  </span>
                  <Slider
                    aria-labelledby={opacityId}
                    max={100}
                    min={0}
                    step={5}
                    value={[opacity]}
                    onValueChange={([value]) => setOpacity(value ?? 50)}
                  />
                </div>
              )}
            </>
          ) : null}
          <SegmentedControl
            aria-label="Recreation color mode"
            value={colorMode}
            onValueChange={(value) => {
              if (value === "light" || value === "dark") setColorMode(value);
            }}
          >
            <SegmentedControlItem value="light">Light</SegmentedControlItem>
            <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </header>

      <main className="grid gap-ds-200 p-ds-200">
        {mode === "side" ? (
          <div className="grid grid-cols-1 gap-ds-200 xl:grid-cols-2">
            <figure className="m-0 grid gap-ds-100">
              <figcaption className="flex items-center justify-between text-heading-xs">
                Reference
                <Button appearance="subtle" spacing="compact" onClick={() => setEnlarged(true)}>
                  <Maximize2 aria-hidden className="size-ds-200" />
                  Enlarge
                </Button>
              </figcaption>
              <FitFrame height={screen.height} width={screen.width}>
                <button
                  aria-label={`Enlarge the reference for ${screen.title}`}
                  className="absolute inset-0 cursor-zoom-in border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-border-focused"
                  type="button"
                  onClick={() => setEnlarged(true)}
                >
                  <ReferenceImage alt="" crop={crop} screen={screen} />
                </button>
              </FitFrame>
            </figure>
            <figure className="m-0 grid gap-ds-100">
              <figcaption className="text-heading-xs">Recreation</figcaption>
              <FitFrame height={screen.height} width={screen.width}>
                <Recreation colorMode={colorMode} screen={screen} />
              </FitFrame>
            </figure>
          </div>
        ) : (
          <FitFrame height={screen.height} width={screen.width}>
            {mode === "slider" ? (
              <SliderCompare axis={axis} colorMode={colorMode} crop={crop} screen={screen} />
            ) : (
              <OverlayCompare
                colorMode={colorMode}
                crop={crop}
                difference={difference}
                opacity={opacity}
                screen={screen}
              />
            )}
          </FitFrame>
        )}
        <AlignPanel crop={crop} screen={screen} onChange={updateCrop} />
      </main>

      <Modal
        hideFooter
        open={enlarged}
        size="full"
        title={`Reference for ${screen.title}`}
        onOpenChange={setEnlarged}
      >
        <div className="grid gap-ds-150">
          <SegmentedControl
            aria-label="Image size"
            value={actualSize ? "actual" : "fit"}
            onValueChange={(value) => setActualSize(value === "actual")}
          >
            <SegmentedControlItem value="fit">Fit</SegmentedControlItem>
            <SegmentedControlItem value="actual">Actual size</SegmentedControlItem>
          </SegmentedControl>
          <div className="max-h-[75vh] overflow-auto rounded-md border border-ds-border bg-ds-surface-sunken">
            <img
              alt={`Reference for ${screen.title}`}
              className={cn("block", actualSize ? "max-w-none" : "h-auto w-full")}
              src={`/references/${screen.reference}`}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
