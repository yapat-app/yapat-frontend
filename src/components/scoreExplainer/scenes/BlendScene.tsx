/**
 * BlendScene — the composite explainer.
 *
 * Three score bars fill, then feed one combined bar that decides where the clip
 * lands in the feed. Two beats contrast a clip that ranks high against one that
 * ranks low.
 *
 * The combined bar deliberately carries no number: composite is a z-scored
 * blend on a different scale from its inputs, and the point being taught is the
 * ordering, not the arithmetic. Showing a 0–1 value here would be a lie the
 * participant could carry into the sidebar.
 */

import React from "react";
import { propertyColor } from "../../../constants/alProperties";
import { beat, easeOut, useSceneClock } from "../useSceneClock";

const BAR_X = 92;
const BAR_W = 196;

interface BlendCase {
  parts: { key: "uncertainty" | "diversity" | "density"; value: number }[];
  verdict: string;
}

const CASES: BlendCase[] = [
  {
    parts: [
      { key: "uncertainty", value: 0.82 },
      { key: "diversity", value: 0.74 },
      { key: "density", value: 0.61 },
    ],
    verdict: "ranked near the top of the feed",
  },
  {
    parts: [
      { key: "uncertainty", value: 0.21 },
      { key: "diversity", value: 0.3 },
      { key: "density", value: 0.55 },
    ],
    verdict: "ranked far down the feed",
  },
];

export const BlendScene: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const t = useSceneClock(active);
  const { index, progress } = beat(t);
  const blendCase = CASES[index];

  const combinedAccent = propertyColor("composite");
  // The three inputs fill first, then the blend resolves — so the causal
  // direction (parts → whole) is visible rather than implied.
  const combined =
    blendCase.parts.reduce((sum, p) => sum + p.value, 0) / blendCase.parts.length;
  const blendGrow = easeOut((progress - 0.42) / 0.3);

  return (
    <svg viewBox="0 0 340 132" className="w-full h-auto" role="img">
      <title>
        Three score bars for one clip filling, then combining into a single bar
        that sets its position in the feed.
      </title>

      {blendCase.parts.map((part, i) => {
        const y = 10 + i * 22;
        const grow = easeOut((progress - 0.06 - i * 0.07) / 0.22);
        const color = propertyColor(part.key);
        return (
          <g key={part.key}>
            <text x={6} y={y + 9} fontSize={11} fill="#6b7280">
              {part.key}
            </text>
            <rect x={BAR_X} y={y} width={BAR_W} height={7} rx={3.5} fill="#eceae4" />
            <rect
              x={BAR_X}
              y={y}
              width={BAR_W * part.value * grow}
              height={7}
              rx={3.5}
              fill={color}
            />
            <text x={BAR_X + BAR_W + 8} y={y + 9} fontSize={11} fill="#9ca3af">
              {(part.value * grow).toFixed(2)}
            </text>
          </g>
        );
      })}

      <line x1={6} y1={84} x2={334} y2={84} stroke="#eceae4" strokeWidth={0.5} />

      <text x={6} y={104} fontSize={11} fill="#1f2937">
        composite
      </text>
      <rect x={BAR_X} y={95} width={BAR_W} height={9} rx={4.5} fill="#eceae4" />
      <rect
        x={BAR_X}
        y={95}
        width={BAR_W * combined * blendGrow}
        height={9}
        rx={4.5}
        fill={combinedAccent}
      />

      {blendGrow > 0.9 && (
        <text x={6} y={124} fontSize={12} fill="#6b7280">
          {blendCase.verdict}
        </text>
      )}
    </svg>
  );
};
