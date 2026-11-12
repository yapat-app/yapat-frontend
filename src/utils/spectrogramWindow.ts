import {
  SPECTROGRAM_FALLBACK_SAMPLE_RATE,
  SPECTROGRAM_MAX_N_FFT,
  SPECTROGRAM_N_FFT,
  clampSpectrogramParams,
  spectrogramParamsForSampleRate,
  type SpectrogramParams,
} from "./spectrogramConfig";
import { DEFAULT_SPECTROGRAM_WINDOW_MS } from "./spectrogramPrefs";

/**
 * FFT parameters for an annotator-chosen analysis window (in ms) and zero
 * padding (the FFT is `zeroPad` times longer than the window needs).
 *
 * The default window and padding return `spectrogramParamsForSampleRate`
 * unchanged, so nobody who leaves the settings alone sees any difference. Other choices keep
 * that same hop (same time resolution of the picture) and only change how
 * much sound each column analyses. The result always goes through
 * `clampSpectrogramParams`: a violated `n_fft >= win_length >= hop_length`
 * would make the WASM backend trap with an uncatchable `unreachable`.
 */
export function spectrogramParamsForWindow(
  sampleRate: number,
  windowMs: number,
  zeroPad = 1,
): SpectrogramParams {
  const base = spectrogramParamsForSampleRate(sampleRate);
  if (windowMs === DEFAULT_SPECTROGRAM_WINDOW_MS && zeroPad === 1) return base;

  // Padding alone keeps today's framing and only lengthens the FFT.
  if (windowMs === DEFAULT_SPECTROGRAM_WINDOW_MS) {
    return clampSpectrogramParams({
      ...base,
      n_fft: Math.min(SPECTROGRAM_MAX_N_FFT, base.n_fft * zeroPad),
    });
  }

  const sr =
    Number.isFinite(sampleRate) && sampleRate > 0
      ? sampleRate
      : SPECTROGRAM_FALLBACK_SAMPLE_RATE;
  const win = Math.max(2, Math.round((sr * windowMs) / 1000));
  const n_fft = Math.min(
    SPECTROGRAM_MAX_N_FFT,
    Math.max(SPECTROGRAM_N_FFT, 2 ** Math.ceil(Math.log2(win))) * zeroPad,
  );
  return clampSpectrogramParams({
    n_fft,
    win_length: win,
    hop_length: base.hop_length,
    n_mels: base.n_mels,
  });
}
