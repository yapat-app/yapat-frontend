/** Mel-spectrogram settings aligned with `react-audio-spectrogram-player` defaults. */
export const SPECTROGRAM_N_FFT = 1024;
export const SPECTROGRAM_HOP_LENGTH = 160;
export const SPECTROGRAM_WIN_LENGTH = 400;
export const SPECTROGRAM_N_MELS = 128;
export const SPECTROGRAM_F_MIN = 0;
export const SPECTROGRAM_FALLBACK_SAMPLE_RATE = 16000;

/**
 * Upper bound on `n_fft`.
 *
 * The mel spectrogram is computed synchronously on the main thread, so this is
 * really a cap on how long the UI freezes while a snippet renders. Measured on
 * a 3 s clip: n_fft 4096 ≈ 295 ms, 8192 ≈ 620 ms, 16384 ≈ 1.25 s. 8192 keeps
 * 192 kHz (the common ultrasonic rate) at a full 25 ms window while bounding
 * the freeze at roughly half a second; above that the window shortens instead
 * of the page locking up for over a second.
 *
 * At 8192 the `win_length >= hop_length` invariant still holds for any sample
 * rate up to 819 kHz — beyond any real recording.
 */
export const SPECTROGRAM_MAX_N_FFT = 8192;

/** Window/hop expressed in time, so framing is sample-rate independent. */
const WIN_SECONDS = 0.025;
const HOP_SECONDS = 0.01;

export interface SpectrogramParams {
  n_fft: number;
  win_length: number;
  hop_length: number;
  n_mels: number;
}

/** Smallest power of two >= n. */
function nextPowerOfTwo(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

/**
 * Scale FFT parameters so the number of analysis windows stays roughly constant
 * regardless of sample rate.
 *
 * The mel-spectrogram is computed in-browser (synchronous FFT on the main
 * thread). The number of windows is `samples / hop_length`, so a fixed
 * `hop_length` tuned for 16 kHz produces 6× as many windows — and 6× the
 * blocking work — for a 96 kHz clip. By making `hop_length`/`win_length`
 * proportional to the sample rate (10 ms hop, 25 ms window), the window count
 * (and therefore the compute cost) is bounded no matter the recording's rate.
 *
 * The Rust/WASM backend (`rust-melspec-wasm`, called by
 * `react-audio-spectrogram-player`) asserts
 *
 *     n_fft >= win_length >= hop_length,  n_fft a power of two
 *
 * and a violated assertion compiles to `unreachable` in release WASM — surfacing
 * in the browser as a bare `RuntimeError: unreachable` with no message and an
 * unreadable stack. A previous version pinned `n_fft` (and therefore capped
 * `win_length`) at 1024 while leaving `hop_length` free to grow, so every
 * recording above ~102.4 kHz — ultrasonic/bat datasets at 192, 250 or 384 kHz —
 * crashed the player on render.
 *
 * The fix deliberately does NOT re-frame recordings that already worked: while
 * the fixed 1024-point FFT still satisfies the assertion we keep it, so every
 * dataset that renders today keeps byte-identical output (and the same render
 * cost). Only once `hop_length` outgrows the 1024-point window does `n_fft`
 * start scaling with the sample rate. `clampSpectrogramParams` re-checks the
 * invariant as a backstop either way.
 *
 * At 16 kHz this returns exactly the legacy constants (1024 / 400 / 160).
 */
export function spectrogramParamsForSampleRate(
  sampleRate: number,
): SpectrogramParams {
  const sr =
    Number.isFinite(sampleRate) && sampleRate > 0
      ? sampleRate
      : SPECTROGRAM_FALLBACK_SAMPLE_RATE;

  // 25 ms window, 10 ms hop — at 16 kHz these are the legacy 400 / 160.
  const targetWin = Math.max(
    SPECTROGRAM_WIN_LENGTH,
    Math.round(sr * WIN_SECONDS),
  );
  const targetHop = Math.max(
    SPECTROGRAM_HOP_LENGTH,
    Math.round(sr * HOP_SECONDS),
  );

  // Legacy framing: fixed 1024-point FFT, window truncated to fit inside it.
  const legacyWin = Math.min(SPECTROGRAM_N_FFT, targetWin);
  if (targetHop <= legacyWin) {
    // Still satisfies the assertion (true up to ~102.4 kHz), so leave it alone.
    return clampSpectrogramParams({
      n_fft: SPECTROGRAM_N_FFT,
      win_length: legacyWin,
      hop_length: targetHop,
      n_mels: SPECTROGRAM_N_MELS,
    });
  }

  // The hop has outgrown a 1024-point window. Grow n_fft to the next power of
  // two that holds the full 25 ms window, restoring proper framing instead of
  // truncating the window below the hop (which is what used to trap).
  const n_fft = Math.min(
    SPECTROGRAM_MAX_N_FFT,
    Math.max(SPECTROGRAM_N_FFT, nextPowerOfTwo(targetWin)),
  );

  return clampSpectrogramParams({
    n_fft,
    win_length: targetWin,
    hop_length: targetHop,
    n_mels: SPECTROGRAM_N_MELS,
  });
}

/**
 * Force `n_fft >= win_length >= hop_length` and `n_mels <= n_fft`.
 *
 * Defence in depth: `spectrogramParamsForSampleRate` already satisfies this, but
 * the cost of being wrong is an uncatchable WASM trap rather than a bad-looking
 * plot, so the invariant is re-imposed at the boundary.
 */
export function clampSpectrogramParams(p: SpectrogramParams): SpectrogramParams {
  const win_length = Math.min(p.n_fft, p.win_length);
  return {
    n_fft: p.n_fft,
    win_length,
    hop_length: Math.min(win_length, p.hop_length),
    n_mels: Math.min(p.n_fft, p.n_mels),
  };
}

/**
 * Fewest samples the WASM backend accepts for these params. Below this it
 * indexes past the reflect-padded signal and traps (again as `unreachable`), so
 * callers must skip the spectrogram rather than hand it a very short clip.
 *
 * Because window and hop both scale with the sample rate, this is ~17.5 ms of
 * audio at any rate.
 */
export function minSamplesForSpectrogram(p: SpectrogramParams): number {
  return Math.floor((p.win_length + p.hop_length) / 2) + 1;
}

/** Shortest clip the spectrogram can render at this sample rate, in seconds. */
export function minDurationForSpectrogram(sampleRate: number): number {
  const sr =
    Number.isFinite(sampleRate) && sampleRate > 0
      ? sampleRate
      : SPECTROGRAM_FALLBACK_SAMPLE_RATE;
  return minSamplesForSpectrogram(spectrogramParamsForSampleRate(sr)) / sr;
}

/** Reserved below the mel canvas (time axis row + optional caption). */
export const SPECTROGRAM_TIME_AXIS_HEIGHT = 22;
export const SPECTROGRAM_INFO_LINE_HEIGHT = 18;
/** `<audio controls>` row rendered by `react-audio-spectrogram-player` below the mel SVG. */
export const SPECTROGRAM_AUDIO_CONTROLS_HEIGHT = 72;

/** Vertical space used by UI outside the library mel canvas. */
export function spectrogramChromeHeight(showAxisInfo = true): number {
  return (
    SPECTROGRAM_TIME_AXIS_HEIGHT +
    SPECTROGRAM_AUDIO_CONTROLS_HEIGHT +
    (showAxisInfo ? SPECTROGRAM_INFO_LINE_HEIGHT : 0)
  );
}

/**
 * `plotHeight` is the mel canvas height (library `specHeight`).
 * `blockHeight` is the full widget including time axis, caption, and audio controls.
 */
export function spectrogramLayoutHeights(
  plotHeight: number,
  showAxisInfo = true,
): { plotHeight: number; blockHeight: number } {
  const melHeight = Math.max(80, plotHeight);
  return {
    plotHeight: melHeight,
    blockHeight: melHeight + spectrogramChromeHeight(showAxisInfo),
  };
}

export function spectrogramFMax(sampleRate: number): number {
  return sampleRate / 2;
}

export interface DatasetSpectrogramRange {
  spectrogram_f_min_hz?: number | null;
  spectrogram_f_max_hz?: number | null;
}

/** Apply dataset display caps; always clamp to Nyquist for the snippet's sample rate. */
export function resolveSpectrogramDisplayRange(
  sampleRate: number,
  dataset?: DatasetSpectrogramRange | null,
): { fMin: number; fMax: number } {
  const nyquist = spectrogramFMax(sampleRate);
  let fMin = SPECTROGRAM_F_MIN;
  let fMax = nyquist;

  if (dataset?.spectrogram_f_min_hz != null && dataset.spectrogram_f_min_hz > 0) {
    fMin = Math.min(dataset.spectrogram_f_min_hz, nyquist);
  }
  if (dataset?.spectrogram_f_max_hz != null && dataset.spectrogram_f_max_hz > 0) {
    fMax = Math.min(dataset.spectrogram_f_max_hz, nyquist);
  }
  if (fMax <= fMin) {
    fMax = Math.max(fMin + 1, nyquist);
  }
  return { fMin, fMax };
}

/**
 * Convert Hz → mel scale (HTK formula used by librosa / react-audio-spectrogram-player).
 */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Convert mel → Hz (inverse of hzToMel).
 */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Build `count` frequency tick values that are evenly spaced on the MEL scale
 * between fMin and fMax. Because the spectrogram image uses a mel scale
 * internally, ticks computed this way align visually with the image content —
 * whereas linearly-spaced ticks appear shifted (e.g. 3 kHz looks like 8 kHz).
 *
 * Returns Hz values in descending order (top → bottom of the Y-axis).
 */
export function buildMelTicks(fMin: number, fMax: number, count: number): number[] {
  if (count <= 1 || fMax <= fMin) return [fMax];
  const melMin = hzToMel(Math.max(0, fMin));
  const melMax = hzToMel(fMax);
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    const mel = melMin + (i / (count - 1)) * (melMax - melMin);
    ticks.push(melToHz(mel));
  }
  // Reverse so the first item is the top of the axis (highest frequency).
  return ticks.reverse();
}

export function formatSpectrogramHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k} kHz` : `${k.toFixed(1)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

export function formatSpectrogramTime(sec: number): string {
  if (sec < 1) return `${(sec * 1000).toFixed(0)} ms`;
  if (sec < 10) return `${sec.toFixed(1)} s`;
  return `${sec.toFixed(0)} s`;
}

export function parseSampleRateHeader(
  value: string | number | null | undefined,
): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : SPECTROGRAM_FALLBACK_SAMPLE_RATE;
}

/**
 * Read sample rate from a PCM WAV blob (backend snippets are written via soundfile).
 * More reliable than `X-Sample-Rate` alone — browsers hide custom headers unless CORS exposes them.
 */
export async function parseWavSampleRate(blob: Blob): Promise<number | null> {
  const buf = await blob.slice(0, 44).arrayBuffer();
  const view = new DataView(buf);
  if (buf.byteLength < 28) return null;
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (riff !== "RIFF" || wave !== "WAVE") return null;
  const rate = view.getUint32(24, true);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function resolveSnippetSampleRate(
  wavRate: number | null | undefined,
  headerRate: string | number | null | undefined,
): number {
  if (wavRate != null && wavRate > 0) return wavRate;
  return parseSampleRateHeader(headerRate);
}
