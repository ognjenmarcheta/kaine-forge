import { useState } from "react";
import { View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

import { Text } from "./text";
import { useThemeTokens } from "./theme-root";
import { cn } from "../../lib/cn";

export interface BarChartSeries {
  key: string;
  label: string;
}

export interface BarChartProps {
  data: ReadonlyArray<Readonly<Record<string, string | number>>>;
  /** The key of each row's category label, shown under its bars. */
  index: string;
  series: readonly BarChartSeries[];
  /** A translated summary of the data for screen readers. */
  accessibilityLabel: string;
  height?: number;
  className?: string;
}

const GRID_LINES = [0, 0.25, 0.5, 0.75, 1];

/** Grouped vertical bars in the theme's chart colors, one group per row of `data`. */
export function BarChart({
  data,
  index,
  series,
  accessibilityLabel,
  height = 160,
  className
}: BarChartProps) {
  const { chart, chartGrid } = useThemeTokens();
  const [width, setWidth] = useState(0);
  const value = (row: Readonly<Record<string, string | number>>, key: string): number => {
    const entry = row[key];
    return typeof entry === "number" ? entry : 0;
  };
  const max = Math.max(1, ...data.flatMap((row) => series.map((entry) => value(row, entry.key))));
  const groupWidth = data.length > 0 ? width / data.length : 0;
  const barWidth = series.length > 0 ? Math.max(4, (groupWidth * 0.6) / series.length) : 0;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      className={cn("w-full gap-ds-100", className)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Svg height={height} width={width}>
        {GRID_LINES.map((line) => (
          <Line
            key={line}
            stroke={chartGrid}
            strokeWidth={1}
            x1={0}
            x2={width}
            y1={height - line * height}
            y2={height - line * height}
          />
        ))}
        {data.flatMap((row, rowIndex) =>
          series.map((entry, seriesIndex) => {
            const barHeight = (value(row, entry.key) / max) * height;
            return (
              <Rect
                key={`${String(row[index])}-${entry.key}`}
                fill={chart[seriesIndex % chart.length] ?? chartGrid}
                height={barHeight}
                rx={4}
                width={barWidth}
                x={rowIndex * groupWidth + groupWidth * 0.2 + seriesIndex * barWidth}
                y={height - barHeight}
              />
            );
          })
        )}
      </Svg>
      <View className="flex-row">
        {data.map((row) => (
          <Text key={String(row[index])} className="flex-1 text-center" variant="caption">
            {String(row[index])}
          </Text>
        ))}
      </View>
    </View>
  );
}
