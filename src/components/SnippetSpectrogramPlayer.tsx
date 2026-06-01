import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import {
  SPECTROGRAM_FALLBACK_SAMPLE_RATE,
  SPECTROGRAM_HOP_LENGTH,
  SPECTROGRAM_N_FFT,
  SPECTROGRAM_N_MELS,
  SPECTROGRAM_TIME_AXIS_HEIGHT,
  SPECTROGRAM_WIN_LENGTH,
  formatSpectrogramHz,
  formatSpectrogramTime,
  resolveSpectrogramDisplayRange,
  spectrogramLayoutHeights,
  type DatasetSpectrogramRange,
} from "../utils/spectrogramConfig";

const Y_AXIS_WIDTH = 44;

export interface SnippetSpectrogramPlayerProps {
  src: string;
  sampleRate?: number;
  /** Dataset-level display band (optional). */
  datasetSpectrogram?: DatasetSpectrogramRange | null;
  /** Snippet length in seconds; when omitted, read from audio metadata. */
  durationSec?: number;
  /** Total vertical space for plot + axes + audio controls (px). */
  specHeight?: number;
  navigator?: boolean;
  settings?: boolean;
  dark?: boolean;
  colormap?: string;
  showAxisInfo?: boolean;
}

function buildTicks(min: number, max: number, count: number): number[] {
  if (count <= 1 || max <= min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export const SnippetSpectrogramPlayer: React.FC<SnippetSpectrogramPlayerProps> = ({
  src,
  sampleRate = SPECTROGRAM_FALLBACK_SAMPLE_RATE,
  datasetSpectrogram,
  durationSec,
  specHeight = 200,
  navigator = false,
  settings = false,
  dark = false,
  colormap = "viridis",
  showAxisInfo = true,
}) => {
  const { plotHeight, blockHeight } = useMemo(
    () => spectrogramLayoutHeights(specHeight, showAxisInfo),
    [specHeight, showAxisInfo],
  );

  const [resolvedDuration, setResolvedDuration] = useState<number | null>(
    durationSec ?? null,
  );
  /**
   * The library reads its render width from the container at mount time and
   * renders at width 0 if the flex layout hasn't settled yet. Instead of
   * remounting the player (which re-decodes the audio and recomputes the FFT
   * every time — the cause of the multi-second grey flash), we measure the
   * container once via ResizeObserver and only mount the player after a
   * non-zero width is known. The player then mounts exactly once per snippet.
   */
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [hasWidth, setHasWidth] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    if (el.clientWidth > 0) {
      setHasWidth(true);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setHasWidth(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (durationSec != null && durationSec > 0) {
      setResolvedDuration(durationSec);
      return;
    }
    const audio = new Audio(src);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDuration(audio.duration);
      }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.load();
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.src = "";
    };
  }, [src, durationSec]);

  const { fMin, fMax } = useMemo(
    () => resolveSpectrogramDisplayRange(sampleRate, datasetSpectrogram),
    [sampleRate, datasetSpectrogram],
  );
  const freqTicks = useMemo(
    () => buildTicks(fMin, fMax, 5).reverse(),
    [fMin, fMax],
  );
  const timeTicks = useMemo(() => {
    const dur = resolvedDuration ?? 0;
    if (dur <= 0) return [];
    return buildTicks(0, dur, 5);
  }, [resolvedDuration]);

  const playerKey = `${src}|${fMin}|${fMax}|${plotHeight}`;

  return (
    <div
      className="w-full flex-shrink-0"
      style={{ minHeight: blockHeight }}
    >
      <div
        className="flex w-full min-w-0 flex-shrink-0"
        style={{ minHeight: plotHeight }}
      >
        {/* Frequency (Hz) axis */}
        <div
          className="flex-shrink-0 flex flex-col justify-between text-[10px] text-gray-500 font-ibm-mono pr-1 select-none"
          style={{ width: Y_AXIS_WIDTH, minHeight: plotHeight }}
          aria-hidden
        >
          {freqTicks.map((hz) => (
            <span key={hz} className="leading-none text-right">
              {formatSpectrogramHz(hz)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Do not clamp height here — library adds audio controls below the mel SVG. */}
          <div ref={measureRef} className="w-full min-w-0">
            {hasWidth && (
              <SpectrogramPlayer
                key={playerKey}
                src={src}
                sampleRate={sampleRate}
                n_fft={SPECTROGRAM_N_FFT}
                win_length={SPECTROGRAM_WIN_LENGTH}
                hop_length={SPECTROGRAM_HOP_LENGTH}
                f_min={fMin}
                f_max={fMax}
                n_mels={SPECTROGRAM_N_MELS}
                specHeight={plotHeight}
                navigator={navigator}
                settings={settings}
                dark={dark}
                colormap={colormap}
              />
            )}
          </div>

          {/* Time axis */}
          <div
            className="flex justify-between text-[10px] text-gray-500 font-ibm-mono pl-0.5 pr-1 select-none border-t border-gray-100 flex-shrink-0"
            style={{ height: SPECTROGRAM_TIME_AXIS_HEIGHT, marginTop: 2 }}
            aria-hidden
          >
            {timeTicks.length > 0 ? (
              timeTicks.map((t) => (
                <span key={t} className="leading-tight">
                  {formatSpectrogramTime(t)}
                </span>
              ))
            ) : (
              <span className="text-gray-400 italic">Time</span>
            )}
          </div>
        </div>
      </div>

      {showAxisInfo && (
        <p className="mt-1 text-[10px] text-gray-400 font-ibm-sans text-center flex-shrink-0">
          Mel spectrogram · {formatSpectrogramHz(fMin)}–
          {formatSpectrogramHz(fMax)} · {Math.round(sampleRate / 1000)} kHz
          sample rate
        </p>
      )}
    </div>
  );
};
