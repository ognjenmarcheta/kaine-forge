import { scaleBand, scaleLinear, scalePoint, scaleTime } from "d3-scale";

/**
 * One value on a plot axis: a number, a category name, or a time. A time scale also takes
 * milliseconds since the epoch or an ISO 8601 string, so fixture data stays JSON.
 */
export type PlotValue = number | string | Date;

/** The scale of one axis. The plot sets the pixel range from its size and margins. */
export type PlotScaleConfig =
  | {
      type: "linear";
      domain: readonly [number, number];
      /** Rounds the domain out to round tick values. */
      nice?: boolean;
    }
  | { type: "time"; domain: readonly [PlotValue, PlotValue] }
  | {
      type: "band";
      domain: readonly string[];
      /** The gap between bands, as a share of the step from 0 to 1. @defaultValue 0.1 */
      paddingInner?: number;
      /** The space before the first and after the last band, as a share of the step. @defaultValue 0 */
      paddingOuter?: number;
    }
  | {
      type: "point";
      domain: readonly string[];
      /** The space before the first and after the last point, as a share of the step. @defaultValue 0 */
      padding?: number;
    };

/** A scale that maps a value to a pixel, whatever its type. */
export interface PlotScale {
  readonly type: PlotScaleConfig["type"];
  /** The pixel of a value: the center of its band on a band scale; NaN for an unknown category. */
  position: (value: PlotValue) => number;
  /** The width of one band; 0 on the other scales. */
  readonly bandwidth: number;
  /** The pixel range, from the start of the axis to its end. */
  readonly range: readonly [number, number];
  /** Round values across the domain for grid lines and labels; every category on a band or point scale. */
  ticks: (count?: number) => PlotValue[];
}

/** A time from a Date, milliseconds, or an ISO 8601 string. */
function toTime(value: PlotValue): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNumber(value: PlotValue): number {
  if (typeof value === "number") return value;
  return value instanceof Date ? value.getTime() : Number(value);
}

/** Builds the d3 scale of `config` over the pixel `range`. */
export function createPlotScale(
  config: PlotScaleConfig,
  range: readonly [number, number]
): PlotScale {
  const pixels: [number, number] = [range[0], range[1]];

  switch (config.type) {
    case "linear": {
      const scale = scaleLinear().domain([config.domain[0], config.domain[1]]).range(pixels);
      if (config.nice === true) scale.nice();
      return {
        type: config.type,
        position: (value) => scale(toNumber(value)),
        bandwidth: 0,
        range,
        ticks: (count) => scale.ticks(count)
      };
    }
    case "time": {
      const scale = scaleTime()
        .domain([toTime(config.domain[0]), toTime(config.domain[1])])
        .range(pixels);
      return {
        type: config.type,
        position: (value) => scale(toTime(value)),
        bandwidth: 0,
        range,
        ticks: (count) => scale.ticks(count)
      };
    }
    case "band": {
      const scale = scaleBand<string>()
        .domain(config.domain)
        .range(pixels)
        .paddingInner(config.paddingInner ?? 0.1)
        .paddingOuter(config.paddingOuter ?? 0);
      const half = scale.bandwidth() / 2;
      return {
        type: config.type,
        position: (value) => (scale(String(value)) ?? Number.NaN) + half,
        bandwidth: scale.bandwidth(),
        range,
        ticks: () => [...config.domain]
      };
    }
    case "point": {
      const scale = scalePoint<string>()
        .domain(config.domain)
        .range(pixels)
        .padding(config.padding ?? 0);
      return {
        type: config.type,
        position: (value) => scale(String(value)) ?? Number.NaN,
        bandwidth: 0,
        range,
        ticks: () => [...config.domain]
      };
    }
  }
}

/** The index of the stop nearest to `pixel`, or -1 when there is no stop. */
export function nearestStop(scale: PlotScale, stops: readonly PlotValue[], pixel: number): number {
  let nearest = -1;
  let distance = Number.POSITIVE_INFINITY;
  stops.forEach((stop, index) => {
    const gap = Math.abs(scale.position(stop) - pixel);
    if (gap < distance) {
      distance = gap;
      nearest = index;
    }
  });
  return nearest;
}
