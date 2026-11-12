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
import type {
  SpectrogramScale,
  SpectrogramWindowType,
} from "./spectrogramCompute";

export const SPECTROGRAM_COLORMAPS = [
  {
    id: "viridis",
    hint: "The default: purple to yellow. Easy on the eyes and clear for most viewers.",
    label: "viridis",
    gradient: "linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)",
  },
  {
    id: "magma",
    hint: "Black to cream through purple and orange. Good for picking out faint detail.",
    label: "magma",
    gradient: "linear-gradient(90deg,#000004,#51127c,#b73779,#fc8961,#fcfdbf)",
  },
  {
    id: "inferno",
    hint: "Black to bright yellow through red. Strong contrast.",
    label: "inferno",
    gradient: "linear-gradient(90deg,#000004,#56106e,#bb3754,#f98e09,#fcffa4)",
  },
  {
    id: "plasma",
    hint: "Blue-purple to yellow. Bright and easy to read.",
    label: "plasma",
    gradient: "linear-gradient(90deg,#0d0887,#7e03a8,#cc4778,#f89540,#f0f921)",
  },
  {
    // `greys` is the name in the `colormap` package behind the player.
    id: "greys",
    hint: "White to black. Good for printing.",
    label: "grayscale",
    gradient: "linear-gradient(90deg,#ffffff,#94a3b8,#000000)",
  },
  {
    id: "hot",
    hint: "Black, red, yellow, then white, like glowing heat.",
    label: "hot",
    gradient: "linear-gradient(90deg,#000000,#e60000,#ffd200,#ffffff)",
  },
  {
    id: "jet",
    hint: "A rainbow. Makes small differences easy to tell apart, but can look harsh.",
    label: "jet",
    gradient:
      "linear-gradient(90deg,#00008f,#0020ff,#00ffff,#ffff00,#ff2000,#800000)",
  },
  {
    id: "bone",
    hint: "Black to white with a cool blue tint. Soft, like an X-ray.",
    label: "bone",
    gradient: "linear-gradient(90deg,#000000,#4a4a63,#a7b6c4,#ffffff)",
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

/** Frequency scale of the picture. Mel is what the player draws by itself. */
export const SPECTROGRAM_SCALES = [
  { id: "mel", label: "Mel" },
  { id: "linear", label: "Linear" },
  { id: "log", label: "Log" },
] as const satisfies ReadonlyArray<{ id: SpectrogramScale; label: string }>;
export const DEFAULT_SPECTROGRAM_SCALE: SpectrogramScale = "mel";

/** Window shape of each analysis frame. Hann is what the player uses. */
export const SPECTROGRAM_WINDOW_TYPES = [
  { id: "hann", label: "Hann" },
  { id: "hamming", label: "Hamming" },
  { id: "blackman", label: "Blackman" },
] as const satisfies ReadonlyArray<{
  id: SpectrogramWindowType;
  label: string;
}>;
export const DEFAULT_SPECTROGRAM_WINDOW_TYPE: SpectrogramWindowType = "hann";

export const SPECTROGRAM_GAIN_DB_MIN = -30;
export const SPECTROGRAM_GAIN_DB_MAX = 30;
export const SPECTROGRAM_BOOST_DB_MAX = 30;

/**
 * Extra zero padding of each analysis window: the FFT is this many times longer
 * than it is today, which draws the pitch axis smoother (the sound itself is
 * the same). 1 is today's setting. Cost grows with it, so it stops at 4.
 */
export const SPECTROGRAM_ZERO_PAD_CHOICES = [1, 2, 4] as const;
export const DEFAULT_SPECTROGRAM_ZERO_PAD = 1;

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
  zeroPad: number;
  scale: SpectrogramScale;
  windowType: SpectrogramWindowType;
  /** Positive makes quiet sounds brighter (and loud ones saturate). */
  gainDb: number;
  /** Tilt in dB per decade: lifts high pitches relative to low ones. */
  highBoostDb: number;
}

export const DEFAULT_SPECTROGRAM_PREFS: SpectrogramPrefs = {
  fMinHz: null,
  fMaxHz: null,
  rangeDb: DEFAULT_SPECTROGRAM_RANGE_DB,
  colormap: "viridis",
  windowMs: DEFAULT_SPECTROGRAM_WINDOW_MS,
  zeroPad: DEFAULT_SPECTROGRAM_ZERO_PAD,
  scale: DEFAULT_SPECTROGRAM_SCALE,
  windowType: DEFAULT_SPECTROGRAM_WINDOW_TYPE,
  gainDb: 0,
  highBoostDb: 0,
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

  const zeroPad =
    SPECTROGRAM_ZERO_PAD_CHOICES.find((z) => z === r.zeroPad) ??
    DEFAULT_SPECTROGRAM_ZERO_PAD;

  const scale =
    SPECTROGRAM_SCALES.find((c) => c.id === r.scale)?.id ??
    DEFAULT_SPECTROGRAM_SCALE;
  const windowType =
    SPECTROGRAM_WINDOW_TYPES.find((c) => c.id === r.windowType)?.id ??
    DEFAULT_SPECTROGRAM_WINDOW_TYPE;

  const clampedInt = (v: unknown, min: number, max: number) => {
    const n = finiteOrNull(v);
    return n === null ? 0 : Math.min(max, Math.max(min, Math.round(n)));
  };
  const gainDb = clampedInt(
    r.gainDb,
    SPECTROGRAM_GAIN_DB_MIN,
    SPECTROGRAM_GAIN_DB_MAX,
  );
  const highBoostDb = clampedInt(r.highBoostDb, 0, SPECTROGRAM_BOOST_DB_MAX);

  return {
    fMinHz,
    fMaxHz,
    rangeDb,
    colormap,
    windowMs,
    zeroPad,
    scale,
    windowType,
    gainDb,
    highBoostDb,
  };
}

export function isDefaultSpectrogramPrefs(p: SpectrogramPrefs): boolean {
  const d = DEFAULT_SPECTROGRAM_PREFS;
  return (
    p.fMinHz === d.fMinHz &&
    p.fMaxHz === d.fMaxHz &&
    p.rangeDb === d.rangeDb &&
    p.colormap === d.colormap &&
    p.windowMs === d.windowMs &&
    p.zeroPad === d.zeroPad &&
    p.scale === d.scale &&
    p.windowType === d.windowType &&
    p.gainDb === d.gainDb &&
    p.highBoostDb === d.highBoostDb
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
  return `${p.fMinHz ?? ""}:${p.fMaxHz ?? ""}|${p.rangeDb}|${p.windowMs}|${p.zeroPad}|${p.scale}|${p.windowType}|${p.gainDb}|${p.highBoostDb}`;
}

/** The options the player cannot draw itself; any of them non-default means we compute the picture. */
export interface CustomAnalysis {
  scale: SpectrogramScale;
  windowType: SpectrogramWindowType;
  gainDb: number;
  highBoostDb: number;
}

/**
 * `null` while the scale, window type, gain and high boost are all at their
 * defaults: the player then computes the picture itself, exactly as before.
 */
export function customAnalysisOf(p: SpectrogramPrefs): CustomAnalysis | null {
  if (
    p.scale === DEFAULT_SPECTROGRAM_SCALE &&
    p.windowType === DEFAULT_SPECTROGRAM_WINDOW_TYPE &&
    p.gainDb === 0 &&
    p.highBoostDb === 0
  ) {
    return null;
  }
  return {
    scale: p.scale,
    windowType: p.windowType,
    gainDb: p.gainDb,
    highBoostDb: p.highBoostDb,
  };
}
