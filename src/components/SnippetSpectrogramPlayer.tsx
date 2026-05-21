import React, { useEffect, useMemo, useState } from "react";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import {
  SPECTROGRAM_F_MIN,
  SPECTROGRAM_FALLBACK_SAMPLE_RATE,
  SPECTROGRAM_HOP_LENGTH,
  SPECTROGRAM_N_FFT,
  SPECTROGRAM_N_MELS,
  SPECTROGRAM_WIN_LENGTH,
  formatSpectrogramHz,
  formatSpectrogramTime,
  spectrogramFMax,
} from "../utils/spectrogramConfig";

const Y_AXIS_WIDTH = 44;
const X_AXIS_HEIGHT = 22;

export interface SnippetSpectrogramPlayerProps {
  src: string;
  sampleRate?: number;
  /** Snippet length in seconds; when omitted, read from audio metadata. */
  durationSec?: number;
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
  durationSec,
  specHeight = 200,
  navigator = false,
  settings = false,
  dark = false,
  colormap = "viridis",
  showAxisInfo = true,
}) => {
  const [resolvedDuration, setResolvedDuration] = useState<number | null>(
    durationSec ?? null,
  );

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

  const fMax = spectrogramFMax(sampleRate);
  const freqTicks = useMemo(
    () => buildTicks(SPECTROGRAM_F_MIN, fMax, 5).reverse(),
    [fMax],
  );
  const timeTicks = useMemo(() => {
    const dur = resolvedDuration ?? 0;
    if (dur <= 0) return [];
    return buildTicks(0, dur, 5);
  }, [resolvedDuration]);

  return (
    <div className="w-full">
      <div className="flex w-full min-w-0">
        {/* Frequency (Hz) axis */}
        <div
          className="flex-shrink-0 flex flex-col justify-between text-[10px] text-gray-500 font-ibm-mono pr-1 select-none"
          style={{ width: Y_AXIS_WIDTH, height: specHeight }}
          aria-hidden
        >
          {freqTicks.map((hz) => (
            <span key={hz} className="leading-none text-right">
              {formatSpectrogramHz(hz)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <SpectrogramPlayer
            key={`${src}-${sampleRate}`}
            src={src}
            sampleRate={sampleRate}
            n_fft={SPECTROGRAM_N_FFT}
            win_length={SPECTROGRAM_WIN_LENGTH}
            hop_length={SPECTROGRAM_HOP_LENGTH}
            f_min={SPECTROGRAM_F_MIN}
            f_max={fMax}
            n_mels={SPECTROGRAM_N_MELS}
            specHeight={specHeight}
            navigator={navigator}
            settings={settings}
            dark={dark}
            colormap={colormap}
          />

          {/* Time axis */}
          <div
            className="flex justify-between text-[10px] text-gray-500 font-ibm-mono pl-0.5 pr-1 select-none border-t border-gray-100"
            style={{ height: X_AXIS_HEIGHT, marginTop: 2 }}
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
        <p className="mt-1 text-[10px] text-gray-400 font-ibm-sans text-center">
          Mel spectrogram · {formatSpectrogramHz(SPECTROGRAM_F_MIN)}–
          {formatSpectrogramHz(fMax)} · {Math.round(sampleRate / 1000)} kHz
          sample rate
        </p>
      )}
    </div>
  );
};
