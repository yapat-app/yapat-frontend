/** Mel-spectrogram settings aligned with `react-audio-spectrogram-player` defaults. */
export const SPECTROGRAM_N_FFT = 1024;
export const SPECTROGRAM_HOP_LENGTH = 160;
export const SPECTROGRAM_WIN_LENGTH = 400;
export const SPECTROGRAM_N_MELS = 128;
export const SPECTROGRAM_F_MIN = 0;
export const SPECTROGRAM_FALLBACK_SAMPLE_RATE = 16000;

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
