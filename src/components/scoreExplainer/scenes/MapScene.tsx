/**
 * MapScene — the diversity / density explainer.
 *
 * Both scores are questions about where a clip sits among the others, so both
 * reuse the projection map the participant already met in Phase 2 rather than
 * introducing a new visual language.
 *
 *   diversity — a measuring line grows from the candidate to its nearest
 *               ALREADY-LABELLED clip. Long line, high score.
 *   density   — a neighbourhood halo expands and its members light up, with a
 *               live count. Crowded, high score.
 *
 * Every number on screen is derived from the toy geometry (the count matches
 * the drawn radius; the line ends on the actual nearest labelled point), so the
 * animation cannot drift from what it claims to show.
 */

import React from "react";
import { propertyColor } from "../../../constants/alProperties";
import {
  DENSITY_CASES,
  DIVERSITY_CASES,
  NEIGHBOURHOOD_RADIUS,
  SCENE_H,
  SCENE_W,
  TOY_LABELLED,
  TOY_POINTS,
  countWithin,
  nearestTo,
} from "../toyScene";
import { beat, easeOut, useSceneClock } from "../useSceneClock";

const DOT = "#d3d1c7";
const DOT_LABELLED = "#5f5e5a";

export const MapScene: React.FC<{
  mode: "diversity" | "density";
  active?: boolean;
}> = ({ mode, active = true }) => {
  const t = useSceneClock(active);
  const { index, progress } = beat(t);

  const isDensity = mode === "density";
  const accent = propertyColor(mode);
  const toyCase = (isDensity ? DENSITY_CASES : DIVERSITY_CASES)[index];
  const candidate = toyCase.candidate;

  // Both scenes grow their measurement over the same window, so switching
  // between the two cards feels like one mechanism asking a different question.
  const grow = easeOut((progress - 0.08) / 0.35);
  const settled = grow > 0.9;
  const pulse = 1 + Math.sin(t * 4) * 0.12;

  const radius = isDensity ? NEIGHBOURHOOD_RADIUS * grow : 0;
  const neighbours = isDensity ? countWithin(candidate, radius) : 0;
  const nearest = isDensity ? null : nearestTo(candidate, TOY_LABELLED).point;

  // The count ticks up as the halo grows — that IS the mechanism being taught —
  // while the verdict is held back until the measurement has settled, so the
  // scene never asserts "a common sound" over a count still climbing from zero.
  const caption = isDensity ? `${neighbours} similar clips nearby` : toyCase.caption;

  return (
    <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H + 42}`} className="w-full h-auto" role="img">
      <title>
        {isDensity
          ? "A projection map where a halo around the highlighted clip counts how many nearby clips sound similar."
          : "A projection map where a line measures the distance from the highlighted clip to the nearest already-labelled clip."}
      </title>
      <rect
        x={2}
        y={2}
        width={SCENE_W - 4}
        height={SCENE_H - 2}
        rx={8}
        fill="none"
        stroke="#eceae4"
        strokeWidth={0.5}
      />

      {isDensity && (
        <circle cx={candidate.x} cy={candidate.y} r={radius} fill={accent} opacity={0.1} />
      )}

      {TOY_POINTS.map((p, i) => {
        const inside = isDensity && Math.hypot(p.x - candidate.x, p.y - candidate.y) <= radius;
        return (
          <circle
            key={i}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            r={inside ? 3 : 2.4}
            fill={inside ? accent : DOT}
          />
        );
      })}

      {TOY_LABELLED.map((p, i) => (
        <circle key={`l${i}`} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3.4} fill={DOT_LABELLED} />
      ))}

      {nearest && (
        <line
          x1={candidate.x}
          y1={candidate.y}
          x2={candidate.x + (nearest.x - candidate.x) * grow}
          y2={candidate.y + (nearest.y - candidate.y) * grow}
          stroke={accent}
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={grow}
        />
      )}

      <circle
        cx={candidate.x}
        cy={candidate.y}
        r={9 * pulse}
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        opacity={0.45}
      />
      <circle cx={candidate.x} cy={candidate.y} r={5} fill="none" stroke={accent} strokeWidth={2.5} />

      <text x={14} y={SCENE_H + 16} fontSize={12} fill="#6b7280">
        {caption}
      </text>
      {settled && (
        <text x={14} y={SCENE_H + 34} fontSize={12.5} fill="#1f2937">
          {toyCase.verdict}
        </text>
      )}
    </svg>
  );
};
