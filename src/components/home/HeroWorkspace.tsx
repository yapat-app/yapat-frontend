/**
 * HeroWorkspace — the illustrative "yapat / workspace" mockup on the home page.
 *
 * A single inline SVG (viewBox 0 0 520 350) that scales with its container:
 * a spectrogram with a moving playhead, a feature projection, a histogram, an
 * audio waveform and a scrolling annotation feed. It shows illustrative data
 * only; it is not connected to any dataset.
 *
 * One 1 s heartbeat (see useWorkspaceMotion) drives every moving part; CSS
 * transitions in HeroWorkspace.css make each change smooth. The motion is
 * skipped under prefers-reduced-motion, and paused while the mockup is off
 * screen or the tab is hidden.
 */

import { useRef } from "react";
import spectrogramUrl from "../../assets/hero-spectrogram.jpg";
import {
  HIST_BARS,
  PROJECTION_POINTS,
  WAVE_PATH,
} from "./heroWorkspaceData";
import { useWorkspaceMotion } from "./useWorkspaceMotion";
import "./HeroWorkspace.css";

/** Label chip, timestamp and confidence of each feed row. The first two rows
 *  repeat at the end so the feed can loop without a visible jump. */
const FEED_ROWS = [
  { dot: "c1", label: "ADEMAR", time: "00:03.2", score: "0.94" },
  { dot: "c2", label: "noise", time: "00:04.6", score: "0.88" },
  { dot: "c3", label: "BOAALM", time: "00:06.1", score: "0.71" },
  { dot: "c1", label: "ADEMAR", time: "00:03.2", score: "0.94" },
  { dot: "c2", label: "noise", time: "00:04.6", score: "0.88" },
] as const;

export const HeroWorkspace = ({ className = "" }: { className?: string }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  useWorkspaceMotion(svgRef);

  return (
    <svg
      ref={svgRef}
      className={`hero-svg ${className}`}
      data-state="0"
      viewBox="0 0 520 350"
      role="img"
      aria-labelledby="hero-svg-title"
    >
      <title id="hero-svg-title">
        YAPAT workspace: audio, spectrogram, feature projection, distribution
        and annotation feed.
      </title>
      <defs>
        <clipPath id="hero-clip-proj">
          <rect x="272" y="72" width="224" height="115" rx="6" />
        </clipPath>
        <clipPath id="hero-clip-feed">
          <rect x="0" y="290" width="520" height="52" />
        </clipPath>
        <clipPath id="hero-clip-spec">
          <rect x="24" y="78" width="222" height="166" rx="4" />
        </clipPath>
        <clipPath id="hero-clip-progress">
          <rect className="v-progress" x="52" y="-2" width="328" height="24" />
        </clipPath>
      </defs>

      <rect className="v-panel" x="0.5" y="0.5" width="519" height="349" rx="10" />
      <line className="v-rule" x1="0" y1="34" x2="520" y2="34" />
      <text className="v-title" x="20" y="22">
        yapat / workspace
      </text>
      <circle className="v-dot" cx="482" cy="17" r="3" />
      <circle className="v-dot" cx="494" cy="17" r="3" />
      <circle className="v-dot" cx="506" cy="17" r="3" />

      <g transform="translate(0 -6)">
        {/* 01 Spectrogram: a real viridis mel spectrogram, static. */}
        <text className="v-label" x="24" y="64">
          01 SPECTROGRAM
        </text>
        <rect className="v-plot" x="16" y="72" width="240" height="180" rx="6" />
        <g clipPath="url(#hero-clip-spec)">
          <image
            href={spectrogramUrl}
            x="24"
            y="78"
            width="222"
            height="166"
            preserveAspectRatio="none"
          />
        </g>
        {/* Red playback line; follows the audio playhead below (same --ph). */}
        <line
          className="v-spec-head"
          clipPath="url(#hero-clip-spec)"
          x1="24"
          y1="78"
          x2="24"
          y2="244"
        />

        {/* 02 Feature projection */}
        <text className="v-label" x="272" y="64">
          02 FEATURE PROJECTION
        </text>
        <rect className="v-plot" x="272" y="72" width="224" height="115" rx="6" />
        <g clipPath="url(#hero-clip-proj)">
          <g className="v-pz">
            {PROJECTION_POINTS.map((p, i) => {
              const style = {
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              } as React.CSSProperties;
              return p.hl !== undefined ? (
                <g key={i} className={`pt hl${p.hl}`} style={style}>
                  <circle className="halo" cx={p.cx} cy={p.cy} r="6.5" />
                  <circle className={p.c} cx={p.cx} cy={p.cy} r="2.4" />
                </g>
              ) : (
                <circle
                  key={i}
                  className={`pt ${p.c}`}
                  style={style}
                  cx={p.cx}
                  cy={p.cy}
                  r="2.4"
                />
              );
            })}
          </g>
        </g>

        {/* 03 Distribution */}
        <text className="v-label" x="272" y="204">
          03 DISTRIBUTION
        </text>
        <line className="v-axis" x1="272" y1="254" x2="496" y2="254" />
        {HIST_BARS.map((b, i) => (
          <rect
            key={i}
            className={`hb ${b.h}`}
            x={b.x}
            y={b.y}
            width="12"
            height={b.height}
            rx="1.5"
          />
        ))}
      </g>

      <line className="v-rule" x1="0" y1="262" x2="520" y2="262" />

      {/* Audio source */}
      <g transform="translate(0 267)">
        <circle className="v-sig-ring" cx="30" cy="10" r="9" />
        <path className="v-sig-bars" d="M27.5 5.5v9M32.5 5.5v9" />
        <path className="v-wave" d={WAVE_PATH} />
        <g className="v-wave-on" clipPath="url(#hero-clip-progress)">
          <path d={WAVE_PATH} />
        </g>
        <line className="v-playhead" x1="52" y1="-1" x2="52" y2="21" />
        <text className="v-feedmuted" x="496" y="13.5" textAnchor="end">
          <tspan className="v-time-now">00:01.4</tspan> / 00:03.0
        </text>
      </g>

      {/* Annotation feed */}
      <g clipPath="url(#hero-clip-feed)">
        <g transform="translate(0 293)">
          <g className="v-feed">
            {FEED_ROWS.map((r, i) => (
              <g key={i} transform={`translate(0 ${i * 26})`}>
                <rect className="v-chip" x="20" y="0" width="84" height="22" rx="11" />
                <circle className={r.dot} cx="34" cy="11" r="4" />
                <text className="v-chiptext" x="46" y="15">
                  {r.label}
                </text>
                <text className="v-feedmuted" x="116" y="15">
                  {r.time}
                </text>
                <text
                  className="v-feedmuted"
                  x="496"
                  y="15"
                  textAnchor="end"
                >
                  {r.score}
                </text>
              </g>
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
};

export default HeroWorkspace;
