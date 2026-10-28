import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { Text } from "./text";
import { useThemeTokens } from "./theme-root";
import { cn } from "../../lib/cn";

export interface DonutChartSegment {
  label: string;
  value: number;
}

export interface DonutChartProps {
  segments: readonly DonutChartSegment[];
  /** A translated summary of the data, such as "293 cases: 40% hypertension, …". */
  accessibilityLabel: string;
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  className?: string;
}

/** Parts of a whole as a ring, in the theme's chart colors, with an optional center figure. */
export function DonutChart({
  segments,
  accessibilityLabel,
  size = 160,
  thickness = 18,
  centerValue,
  centerLabel,
  className
}: DonutChartProps) {
  const { chart, chartGrid, track } = useThemeTokens();
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const gap = segments.length > 1 ? 4 : 0;
  const arcs = segments.map((segment, index) => {
    const before = segments.slice(0, index).reduce((sum, entry) => sum + entry.value, 0);
    const length = total > 0 ? (segment.value / total) * circumference : 0;
    return {
      color: chart[index % chart.length] ?? chartGrid,
      dash: Math.max(length - gap, 0),
      label: segment.label,
      offset: total > 0 ? (before / total) * circumference : 0
    };
  });

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      className={cn("items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <Svg height={size} width={size}>
        <G origin={`${center}, ${center}`} rotation={-90}>
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={track}
            strokeWidth={thickness}
          />
          {arcs.map((arc) => (
            <Circle
              key={arc.label}
              cx={center}
              cy={center}
              fill="none"
              r={radius}
              stroke={arc.color}
              strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
              strokeDashoffset={-arc.offset}
              strokeWidth={thickness}
            />
          ))}
        </G>
      </Svg>
      {centerValue ? (
        <View className="absolute items-center" pointerEvents="none">
          <Text className="text-2xl font-semibold">{centerValue}</Text>
          {centerLabel ? <Text variant="caption">{centerLabel}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
