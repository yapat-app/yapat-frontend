/**
 * ConfidenceScene — the confidence explainer.
 *
 * Two predictions for the same kind of sound, one the model barely commits to
 * and one it strongly commits to, each as a labelled gauge. Kept visually
 * distinct from the uncertainty scene (bars, not distributions) so the two
 * cards read as separate ideas rather than restatements of one another.
 */

import React from "react";
import { propertyColor } from "../../../constants/alProperties";
import { easeOut, useSceneClock } from "../useSceneClock";

const MUTED = "#c9c7be";
const BAR_X = 8;
const BAR_W = 324;

interface GaugeProps {
  y: number;
  value: number;
  accent: string;
  verdict: string;
  grow: number;
}

const Gauge: React.FC<GaugeProps> = ({ y, value, accent, verdict, grow }) => {
  const shown = value * grow;
  return (
    <g>
      <text x={BAR_X} y={y} fontSize={12.5} fill="#1f2937">
        {`Bird call — ${Math.round(shown * 100)}%`}
      </text>
      <rect x={BAR_X} y={y + 8} width={BAR_W} height={9} rx={4.5} fill="#eceae4" />
      <rect x={BAR_X} y={y + 8} width={BAR_W * shown} height={9} rx={4.5} fill={accent} />
      <text x={BAR_X} y={y + 34} fontSize={12} fill="#6b7280">
        {verdict}
      </text>
    </g>
  );
};

export const ConfidenceScene: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const t = useSceneClock(active);
  // Both gauges fill, hold, then reset together — the pause is what lets the
  // two percentages be compared rather than just watched.
  const cycle = (t % 5) / 5;
  const grow = easeOut(cycle / 0.4);

  return (
    <svg viewBox="0 0 340 108" className="w-full h-auto" role="img">
      <title>
        Two predictions for a bird call, one at 54 percent and one at 96 percent.
      </title>
      <Gauge y={14} value={0.54} accent={MUTED} verdict="Low confidence" grow={grow} />
      <Gauge
        y={72}
        value={0.96}
        accent={propertyColor("confidence")}
        verdict="High confidence"
        grow={grow}
      />
    </svg>
  );
};
