/** Mel-spectrogram settings aligned with `react-audio-spectrogram-player` defaults. */
export const SPECTROGRAM_N_FFT = 1024;
export const SPECTROGRAM_HOP_LENGTH = 160;
export const SPECTROGRAM_WIN_LENGTH = 400;
export const SPECTROGRAM_N_MELS = 128;
export const SPECTROGRAM_F_MIN = 0;
export const SPECTROGRAM_FALLBACK_SAMPLE_RATE = 16000;

export function spectrogramFMax(sampleRate: number): number {
  return sampleRate / 2;
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
