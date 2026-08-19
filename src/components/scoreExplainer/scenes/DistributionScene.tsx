/**
 * DistributionScene — the uncertainty explainer.
 *
 * Uncertainty is computed as entropy over the model's predicted label
 * distribution, so the scene shows that distribution directly: a spread-out
 * distribution (the model's belief is smeared across many possible sounds) has
 * high entropy, a concentrated one has low entropy.
 *
 * Deliberately drawn over discrete possible sounds rather than along an
 * absent → present axis. On a probability axis a narrow peak in the middle
 * would mean "confidently 50/50", which is maximum uncertainty, not minimum —
 * the shape would contradict the label. Over classes, spread-vs-concentrated
 * reads correctly wherever the peak happens to sit.
 */

import React from "react";
import { propertyColor } from "../../../constants/alProperties";
import { useSceneClock } from "../useSceneClock";

const MUTED = "#c9c7be";
const BASELINE = 78;
const MAX_BAR = 58;
const BAR_W = 18;
const BAR_GAP = 6;

/** Roughly equal mass over every option — high entropy. */
const SPREAD = [0.17, 0.16, 0.18, 0.16, 0.17, 0.16];
/** Almost all mass on one option — low entropy. */
const PEAKED = [0.03, 0.04, 0.82, 0.04, 0.03, 0.04];

interface PanelProps {
  x: number;
  probabilities: number[];
  accent: string;
  verdict: string;
  /** Per-bar wobble amplitude; the unsure distribution never quite settles. */
  jitter: number;
  t: number;
}

const Panel: React.FC<PanelProps> = ({ x, probabilities, accent, verdict, jitter, t }) => {
  // Scaled so the tallest bar of the concentrated distribution fills the panel;
  // the spread one is then visibly low and flat by comparison.
  const scale = MAX_BAR / 0.82;
  return (
    <g>
      {probabilities.map((p, i) => {
        const wobble = jitter === 0 ? 0 : Math.sin(t * 1.7 + i * 1.9) * jitter;
        const h = Math.max(1.5, (p + wobble) * scale);
        return (
          <rect
            key={i}
            x={x + i * (BAR_W + BAR_GAP)}
            y={BASELINE - h}
            width={BAR_W}
            height={h}
            rx={2}
            fill={accent}
          />
        );
      })}
      <line x1={x - 2} y1={BASELINE} x2={x + 140} y2={BASELINE} stroke="#e5e7eb" strokeWidth={1} />
      <text x={x - 2} y={93} fontSize={11} fill="#9ca3af">
        possible sounds
      </text>
      <text x={x - 2} y={112} fontSize={12.5} fill="#1f2937">
        {verdict}
      </text>
    </g>
  );
};

export const DistributionScene: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const t = useSceneClock(active);

  return (
    <svg viewBox="0 0 340 120" className="w-full h-auto" role="img">
      <title>
        Two predicted probability distributions: one spread evenly across many
        possible sounds, one concentrated on a single sound.
      </title>
      <Panel
        x={8}
        probabilities={SPREAD}
        accent={propertyColor("uncertainty")}
        verdict="High uncertainty"
        jitter={0.022}
        t={t}
      />
      <Panel
        x={192}
        probabilities={PEAKED}
        accent={MUTED}
        verdict="Low uncertainty"
        jitter={0}
        t={t}
      />
    </svg>
  );
};
