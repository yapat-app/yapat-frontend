/**
 * Our own spectrogram computation, used only when an annotator picks a display
 * option the player cannot do itself (a linear or logarithmic frequency scale,
 * gain, high boost, or another window type). The player accepts a ready-made
 * spectrogram through its `sxx` prop; this produces one.
 *
 * With every such option left at its default the player computes the picture
 * itself, exactly as before, and nothing here runs.
 *
 * Output shape (what the player expects): `sxx[row][column]`, row 0 = lowest
 * frequency (drawn at the bottom), column = time. Values are dB; the player
 * colours them between their minimum and maximum.
 *
 * Kept free of imports from the rest of the app so it can be unit-tested.
 */

export type SpectrogramScale = "mel" | "linear" | "log";
export type SpectrogramWindowType = "hann" | "hamming" | "blackman";

/** The log scale starts here at the lowest (a log axis has no 0 Hz). */
export const LOG_SCALE_MIN_HZ = 20;

/** More columns than this are pointless on screen and cost time and memory. */
const MAX_FRAMES = 6000;
/** Upper bound on rows x columns, so a long recording cannot exhaust memory. */
const MAX_CELLS = 4_000_000;
/** Upper bound on FFT butterflies (about 4 s of work); bigger FFTs are shrunk. */
const MAX_BUTTERFLIES = 8e8;

export interface ComputeOptions {
  sampleRate: number;
  nFft: number;
  winLength: number;
  hopLength: number;
  windowType: SpectrogramWindowType;
  scale: SpectrogramScale;
  fMin: number;
  fMax: number;
  /** Frequency rows asked for (fewer may be used for a very long recording). */
  rows: number;
  /** Shifts which levels show as bright: positive makes quiet sounds brighter. */
  gainDb: number;
  /** Tilt in dB per decade above 1 kHz (and below it, the opposite way). */
  highBoostDb: number;
  /** How many dB below the brightest level still get a colour. */
  rangeDb: number;
}

const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

/** Periodic window (the kind used for spectral analysis). */
export function windowFunction(
  type: SpectrogramWindowType,
  n: number,
): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / n;
    if (type === "hamming") w[i] = 0.54 - 0.46 * Math.cos(x);
    else if (type === "blackman")
      w[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
    else w[i] = 0.5 - 0.5 * Math.cos(x);
  }
  return w;
}

/** In-place forward FFT of a power-of-two length, with its tables prepared once. */
export function makeFft(n: number) {
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT size must be a power of two, got ${n}`);
  }
  const cos = new Float64Array(n >> 1);
  const sin = new Float64Array(n >> 1);
  for (let i = 0; i < n >> 1; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  return (re: Float64Array, im: Float64Array) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  };
}

function axisOf(scale: SpectrogramScale, fMin: number, fMax: number) {
  const lo =
    scale === "log" ? Math.max(fMin, LOG_SCALE_MIN_HZ) : Math.max(0, fMin);
  const hi = Math.max(fMax, lo + 1);
  const to =
    scale === "mel" ? hzToMel : scale === "log" ? Math.log : (x: number) => x;
  return { lo, hi, to };
}

/** Centre frequency of each row, lowest first, evenly spaced on the chosen scale. */
export function frequencyRows(
  scale: SpectrogramScale,
  fMin: number,
  fMax: number,
  rows: number,
): number[] {
  const { lo, hi, to } = axisOf(scale, fMin, fMax);
  const from =
    scale === "mel" ? melToHz : scale === "log" ? Math.exp : (x: number) => x;
  const a = to(lo);
  const b = to(hi);
  const out: number[] = [];
  for (let i = 0; i < rows; i++) {
    out.push(from(rows === 1 ? a : a + ((b - a) * i) / (rows - 1)));
  }
  return out;
}

interface Bands {
  centres: number[];
  starts: Int32Array;
  weights: Float64Array[];
}

/**
 * For each row, which FFT bins feed it and how much (weights sum to 1).
 * A row averages the bins under a triangle reaching to its neighbours'
 * centres; a row narrower than the FFT's bins interpolates between the two
 * nearest bins instead, so it is never empty.
 */
function buildBands(o: ComputeOptions, nFft: number, rows: number): Bands {
  const centres = frequencyRows(o.scale, o.fMin, o.fMax, rows);
  const binHz = o.sampleRate / nFft;
  const lastBin = nFft >> 1;
  const starts = new Int32Array(rows);
  const weights: Float64Array[] = [];
  for (let r = 0; r < rows; r++) {
    const c = centres[r];
    const lo =
      r > 0 ? centres[r - 1] : Math.max(0, c - (centres[1] - c || binHz));
    const hi =
      r < rows - 1 ? centres[r + 1] : c + (c - (centres[r - 1] ?? c - binHz));
    let w: number[] = [];
    let start = 0;
    if (hi - lo >= 2 * binHz) {
      const k0 = Math.max(0, Math.ceil(lo / binHz));
      const k1 = Math.min(lastBin, Math.floor(hi / binHz));
      start = k0;
      for (let k = k0; k <= k1; k++) {
        const f = k * binHz;
        const v = f <= c ? (f - lo) / (c - lo || 1) : (hi - f) / (hi - c || 1);
        w.push(Math.max(0, v));
      }
    }
    let sum = w.reduce((s, v) => s + v, 0);
    if (sum <= 1e-9) {
      const pos = Math.min(lastBin - 1, Math.max(0, c / binHz));
      const k = Math.floor(pos);
      const frac = pos - k;
      start = k;
      w = [1 - frac, frac];
      sum = 1;
    }
    starts[r] = start;
    weights.push(Float64Array.from(w, (v) => v / sum));
  }
  return { centres, starts, weights };
}

/**
 * Compute the spectrogram. Resolves to `null` when cancelled or when there is
 * too little audio. Yields to the browser regularly so the page stays usable.
 */
export async function computeSpectrogram(
  samples: Float32Array,
  o: ComputeOptions,
  cancelled: () => boolean = () => false,
): Promise<number[][] | null> {
  const N = samples.length;
  if (N < 2 || o.sampleRate <= 0) return null;

  const win = Math.max(2, Math.round(o.winLength));
  let nFft = 2 ** Math.ceil(Math.log2(Math.max(o.nFft, win)));
  const minFft = 2 ** Math.ceil(Math.log2(win));
  const hop = Math.max(
    1,
    Math.max(Math.round(o.hopLength), Math.ceil(N / MAX_FRAMES)),
  );
  const frames = 1 + Math.floor(N / hop);

  // Shrink the FFT (less zero padding) before it becomes too slow.
  const butterflies = (n: number) => frames * (n / 2) * Math.log2(n);
  while (nFft > minFft && butterflies(nFft) > MAX_BUTTERFLIES) nFft >>= 1;

  const rows = Math.max(32, Math.min(o.rows, Math.floor(MAX_CELLS / frames)));
  const bands = buildBands(o, nFft, rows);
  const window = windowFunction(o.windowType, win);
  let wsum = 0;
  for (let i = 0; i < win; i++) wsum += window[i];
  // A full-scale sine reads 0 dB.
  const norm = (wsum / 2) ** 2 || 1;

  const tilt = bands.centres.map(
    (c) => o.highBoostDb * Math.log10(Math.max(c, 1) / 1000),
  );
  const fft = makeFft(nFft);
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const power = new Float64Array((nFft >> 1) + 1);
  const offset = (nFft - win) >> 1;
  const half = win >> 1;
  const period = 2 * (N - 1);
  const at = (s: number) => {
    if (s >= 0 && s < N) return samples[s];
    const m = ((s % period) + period) % period;
    return samples[m < N ? m : period - m];
  };

  const out: number[][] = Array.from(
    { length: rows },
    () => new Array<number>(frames),
  );
  let maxDb = -Infinity;
  for (let t = 0; t < frames; t++) {
    re.fill(0);
    im.fill(0);
    const base = t * hop - half;
    for (let i = 0; i < win; i++) re[offset + i] = at(base + i) * window[i];
    fft(re, im);
    for (let k = 0; k <= nFft >> 1; k++)
      power[k] = re[k] * re[k] + im[k] * im[k];
    for (let r = 0; r < rows; r++) {
      const w = bands.weights[r];
      const s = bands.starts[r];
      let p = 0;
      for (let j = 0; j < w.length; j++) p += w[j] * power[s + j];
      const db = 10 * Math.log10(Math.max(p / norm, 1e-12)) + tilt[r];
      out[r][t] = db;
      if (db > maxDb) maxDb = db;
    }
    if ((t & 31) === 31) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (cancelled()) return null;
    }
  }

  // The brightest level shifts down with gain; everything outside the range clips.
  const top = maxDb - o.gainDb;
  const bottom = top - Math.max(1, o.rangeDb);
  for (let r = 0; r < rows; r++) {
    const row = out[r];
    for (let t = 0; t < frames; t++) {
      const v = row[t];
      row[t] = v > top ? top : v < bottom ? bottom : v;
    }
  }
  return out;
}
