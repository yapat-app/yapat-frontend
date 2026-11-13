import { useEffect, useState } from "react";
import { computeSpectrogram } from "../utils/spectrogramCompute";
import type { SpectrogramParams } from "../utils/spectrogramConfig";
import type { CustomAnalysis } from "../utils/spectrogramPrefs";

/** What the player draws (as a dark, empty picture) while the real one is computed. */
export const PLACEHOLDER_SXX: number[][] = [
  [0, 0],
  [0, 0],
];

// Decoding is the slow part and does not depend on any display setting, so a
// few decoded recordings are kept: changing a setting then only recomputes.
const decoded = new Map<string, Promise<Float32Array>>();
const MAX_DECODED = 4;

function decodeMono(url: string, sampleRate: number): Promise<Float32Array> {
  const key = `${url}|${sampleRate}`;
  const hit = decoded.get(key);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(url);
    const bytes = await res.arrayBuffer();
    // An offline context at the file's own rate: decoding resamples to it.
    const ctx = new OfflineAudioContext(1, 1, Math.round(sampleRate));
    const buf = await ctx.decodeAudioData(bytes);
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < mono.length; i++)
        mono[i] += ch[i] / buf.numberOfChannels;
    }
    return mono;
  })();
  decoded.set(key, p);
  if (decoded.size > MAX_DECODED) {
    const oldest = decoded.keys().next().value;
    if (oldest !== undefined) decoded.delete(oldest);
  }
  p.catch(() => decoded.delete(key));
  return p;
}

interface Args {
  src: string;
  sampleRate: number;
  /** `null` while every option is at its default: nothing is computed. */
  analysis: CustomAnalysis | null;
  params: SpectrogramParams;
  fMin: number;
  fMax: number;
  rangeDb: number;
}

interface Result {
  sxx: number[][] | null;
  /** True while the picture is still being computed. */
  pending: boolean;
}

/**
 * The spectrogram for the options the player cannot draw itself, or `null`
 * sxx with `pending: false` when none apply (or the computation failed, in
 * which case the player simply draws its own picture).
 */
export function useCustomSpectrogram({
  src,
  sampleRate,
  analysis,
  params,
  fMin,
  fMax,
  rangeDb,
}: Args): Result {
  const { n_fft, win_length, hop_length, n_mels } = params;
  const scale = analysis?.scale;
  const windowType = analysis?.windowType;
  const gainDb = analysis?.gainDb;
  const highBoostDb = analysis?.highBoostDb;

  const key =
    analysis && src
      ? [
          src,
          sampleRate,
          fMin,
          fMax,
          n_fft,
          win_length,
          hop_length,
          rangeDb,
          scale,
          windowType,
          gainDb,
          highBoostDb,
        ].join("|")
      : null;

  const [result, setResult] = useState<{
    key: string;
    sxx: number[][] | null;
  } | null>(null);

  useEffect(() => {
    if (
      key === null ||
      scale === undefined ||
      windowType === undefined ||
      gainDb === undefined ||
      highBoostDb === undefined
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const samples = await decodeMono(src, sampleRate);
        if (cancelled) return;
        const sxx = await computeSpectrogram(
          samples,
          {
            sampleRate,
            nFft: n_fft,
            winLength: win_length,
            hopLength: hop_length,
            windowType,
            scale,
            fMin,
            fMax,
            // Mel keeps the player's own band count; the others show more detail.
            rows: scale === "mel" ? n_mels : 256,
            gainDb,
            highBoostDb,
            rangeDb,
          },
          () => cancelled,
        );
        if (!cancelled) setResult({ key, sxx });
      } catch (e) {
        console.warn("Custom spectrogram failed; using the default one.", e);
        if (!cancelled) setResult({ key, sxx: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    key,
    src,
    sampleRate,
    n_fft,
    win_length,
    hop_length,
    n_mels,
    fMin,
    fMax,
    rangeDb,
    scale,
    windowType,
    gainDb,
    highBoostDb,
  ]);

  if (key === null) return { sxx: null, pending: false };
  if (result?.key !== key) return { sxx: null, pending: true };
  return { sxx: result.sxx, pending: false };
}
