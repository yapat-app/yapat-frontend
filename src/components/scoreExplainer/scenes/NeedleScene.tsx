/**
 * NeedleScene — the uncertainty / confidence explainer.
 *
 * Two clips side by side, each with a "is the species present?" probability
 * bar. The left needle never settles off the 50% tick (the model is torn); the
 * right one is parked at 94% (the model has committed). Uncertainty and
 * confidence are two ends of the same bar, so one scene teaches both — the
 * `emphasis` prop only decides which column is drawn in the accent colour.
 */

import React from "react";
import { propertyColor } from "../../../constants/alProperties";
import { useSceneClock } from "../useSceneClock";

const MUTED = "#9ca3af";
const CONFIDENT_P = 0.94;

/** One deterministic pseudo-spectrogram: [x, y, opacity] per cell. */
type Cell = [number, number, number];

function buildCells(seed: number): Cell[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const cells: Cell[] = [];
  for (let col = 0; col < 25; col++) {
    for (let row = 0; row < 7; row++) {
      const v = rand();
      // Mid-frequency rows carry the "call"; the rest is low-level background.
      const energy = row > 1 && row < 5 && rand() > 0.45 ? v * 0.9 + 0.1 : v * 0.28;
      if (energy > 0.12) {
        cells.push([3 + col * 5.9, 2 + row * 5.3, Number(energy.toFixed(2))]);
      }
    }
  }
  return cells;
}

const TORN_CELLS = buildCells(3);
const SURE_CELLS = buildCells(11);

const Spectrogram: React.FC<{ x: number; cells: Cell[] }> = ({ x, cells }) => (
  <g>
    <rect x={x} y={4} width={152} height={40} rx={4} fill="#f6f5f1" />
    {cells.map(([cx, cy, o], i) => (
      <rect
        key={i}
        x={x + cx}
        y={4 + cy}
        width={5}
        height={4.4}
        fill="#1f2937"
        opacity={o}
      />
    ))}
  </g>
);

interface ColumnProps {
  x: number;
  cells: Cell[];
  probability: number;
  accent: string;
  verdict: string;
}

const Column: React.FC<ColumnProps> = ({ x, cells, probability, accent, verdict }) => (
  <g>
    <Spectrogram x={x} cells={cells} />
    <rect x={x} y={62} width={152} height={7} rx={3.5} fill="#eceae4" />
    <line x1={x + 76} y1={59} x2={x + 76} y2={72} stroke="#d1d5db" strokeWidth={1} />
    <rect x={x} y={62} width={152 * probability} height={7} rx={3.5} fill={accent} />
    <circle
      cx={x + 152 * probability}
      cy={65.5}
      r={5}
      fill={accent}
      stroke="#ffffff"
      strokeWidth={2}
    />
    <text x={x} y={84} fontSize={11} fill="#9ca3af">
      absent
    </text>
    <text x={x + 152} y={84} fontSize={11} textAnchor="end" fill="#9ca3af">
      present
    </text>
    <text x={x} y={104} fontSize={13} fill="#1f2937">
      {`present: ${Math.round(probability * 100)}%`}
    </text>
    <text x={x} y={122} fontSize={12} fill="#6b7280">
      {verdict}
    </text>
  </g>
);

export const NeedleScene: React.FC<{
  emphasis: "torn" | "sure";
  active?: boolean;
}> = ({ emphasis, active = true }) => {
  const t = useSceneClock(active);

  // Two overlaid sine waves so the needle wanders rather than swinging
  // metronomically — it should read as indecision, not as a periodic control.
  const tornP = 0.5 + Math.sin(t * 2.1) * 0.055 + Math.sin(t * 3.7) * 0.02;

  const tornAccent = emphasis === "torn" ? propertyColor("uncertainty") : MUTED;
  const sureAccent = emphasis === "sure" ? propertyColor("confidence") : MUTED;

  return (
    <svg viewBox="0 0 340 132" className="w-full h-auto" role="img">
      <title>
        Two clips: the model&apos;s prediction for the first hovers around 50
        percent, the second is settled at 94 percent.
      </title>
      <Column
        x={6}
        cells={TORN_CELLS}
        probability={tornP}
        accent={tornAccent}
        verdict="model can't decide — label this"
      />
      <Column
        x={182}
        cells={SURE_CELLS}
        probability={CONFIDENT_P}
        accent={sureAccent}
        verdict="model is sure — little to learn"
      />
    </svg>
  );
};
