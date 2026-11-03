/**
 * Annotator-facing spectrogram display preferences ("Spectrogram settings").
 *
 * These only change how audio is DRAWN; the audio and the stored data are
 * never touched. Every default below equals what the app used before these
 * settings existed, so a user who never opens them gets exactly the same
 * spectrogram parameters as before.
 *
 * Precedence for the frequency band: built-in (0..Nyquist) < dataset range
 * (set by admins) < the annotator's own range (this file).
 */

import type { DatasetSpectrogramRange } from "./spectrogramConfig";

export const SPECTROGRAM_COLORMAPS = [
  {
    id: "viridis",
    label: "viridis",
    gradient: "linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)",
  },
  {
    id: "magma",
    label: "magma",
    gradient: "linear-gradient(90deg,#000004,#51127c,#b73779,#fc8961,#fcfdbf)",
  },
  {
    id: "inferno",
    label: "inferno",
    gradient: "linear-gradient(90deg,#000004,#56106e,#bb3754,#f98e09,#fcffa4)",
  },
  {
    id: "plasma",
    label: "plasma",
    gradient: "linear-gradient(90deg,#0d0887,#7e03a8,#cc4778,#f89540,#f0f921)",
  },
  {
    // `greys` is the name in the `colormap` package behind the player.
    id: "greys",
    label: "grayscale",
    gradient: "linear-gradient(90deg,#ffffff,#94a3b8,#000000)",
  },
] as const;

export type SpectrogramColormap = (typeof SPECTROGRAM_COLORMAPS)[number]["id"];

/**
 * Analysis window lengths offered in the UI. 25 ms is today's framing.
 *
 * Drawing cost grows with window length (the FFT size follows it). Measured on
 * the player's WASM: 100 ms took ~0.4 s per 3 s snippet at 44.1 kHz and ~9 s
 * for a 1-minute file, which would stall the feed, so the choices stop at 50 ms.
 */
export const SPECTROGRAM_WINDOW_CHOICES_MS = [12, 25, 50] as const;
export const DEFAULT_SPECTROGRAM_WINDOW_MS = 25;

/** react-audio-spectrogram-player's own default for `top_db`. */
export const DEFAULT_SPECTROGRAM_RANGE_DB = 80;
export const SPECTROGRAM_RANGE_DB_MIN = 20;
export const SPECTROGRAM_RANGE_DB_MAX = 120;

export interface SpectrogramPrefs {
  /** null = use the dataset range / full band. */
  fMinHz: number | null;
  fMaxHz: number | null;
  rangeDb: number;
  colormap: SpectrogramColormap;
  windowMs: number;
}

export const DEFAULT_SPECTROGRAM_PREFS: SpectrogramPrefs = {
  fMinHz: null,
  fMaxHz: null,
  rangeDb: DEFAULT_SPECTROGRAM_RANGE_DB,
  colormap: "viridis",
  windowMs: DEFAULT_SPECTROGRAM_WINDOW_MS,
};

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Validate untrusted input (localStorage); anything invalid falls back to the default. */
export function sanitizeSpectrogramPrefs(raw: unknown): SpectrogramPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_SPECTROGRAM_PREFS;
  const r = raw as Record<string, unknown>;

  let fMinHz = finiteOrNull(r.fMinHz);
  let fMaxHz = finiteOrNull(r.fMaxHz);
  if (fMinHz !== null && fMinHz < 0) fMinHz = null;
  if (fMaxHz !== null && fMaxHz <= 0) fMaxHz = null;
  // A range is either fully custom or not at all.
  if (fMinHz === null || fMaxHz === null || fMinHz >= fMaxHz) {
    fMinHz = null;
    fMaxHz = null;
  }

  const rangeRaw = finiteOrNull(r.rangeDb);
  const rangeDb =
    rangeRaw === null
      ? DEFAULT_SPECTROGRAM_RANGE_DB
      : Math.min(
          SPECTROGRAM_RANGE_DB_MAX,
          Math.max(SPECTROGRAM_RANGE_DB_MIN, Math.round(rangeRaw)),
        );

  const colormap =
    SPECTROGRAM_COLORMAPS.find((c) => c.id === r.colormap)?.id ??
    DEFAULT_SPECTROGRAM_PREFS.colormap;

  const windowMs =
    SPECTROGRAM_WINDOW_CHOICES_MS.find((w) => w === r.windowMs) ??
    DEFAULT_SPECTROGRAM_WINDOW_MS;

  return { fMinHz, fMaxHz, rangeDb, colormap, windowMs };
}

export function isDefaultSpectrogramPrefs(p: SpectrogramPrefs): boolean {
  const d = DEFAULT_SPECTROGRAM_PREFS;
  return (
    p.fMinHz === d.fMinHz &&
    p.fMaxHz === d.fMaxHz &&
    p.rangeDb === d.rangeDb &&
    p.colormap === d.colormap &&
    p.windowMs === d.windowMs
  );
}

/**
 * Layer the annotator's range over the dataset's. Returns the dataset object
 * itself (same reference) when the annotator has no custom range, so default
 * users flow through exactly as before.
 */
export function applyPrefsToDatasetRange(
  dataset: DatasetSpectrogramRange | null | undefined,
  prefs: SpectrogramPrefs,
): DatasetSpectrogramRange | null | undefined {
  if (prefs.fMinHz === null || prefs.fMaxHz === null) return dataset;
  return {
    spectrogram_f_min_hz: prefs.fMinHz,
    spectrogram_f_max_hz: prefs.fMaxHz,
  };
}

/** Stable string that changes whenever ANY setting does. */
export function spectrogramPrefsKey(p: SpectrogramPrefs): string {
  return `${spectrogramAnalysisKey(p)}|${p.colormap}`;
}

/**
 * Changes only when the sound has to be analysed again. The colour is left out
 * on purpose: it only re-colours a picture that already exists, so changing it
 * must not redo the (slow) analysis.
 */
export function spectrogramAnalysisKey(p: SpectrogramPrefs): string {
  return `${p.fMinHz ?? ""}:${p.fMaxHz ?? ""}|${p.rangeDb}|${p.windowMs}`;
}
