import React, { useEffect, useMemo, useRef, useState } from "react";
import { SnippetSpectrogramPlayer } from "./SnippetSpectrogramPlayer";
import { SPECTROGRAM_FALLBACK_SAMPLE_RATE } from "../utils/spectrogramConfig";
import { Form } from "antd";

type UploadedSnippetPlayerProps = {
  defaultWindowSec?: number;
  onChange?: (value: {
    audioFile: File | null;
    startSec: number;
    endSec: number;
  }) => void;
};

export const UploadSampleAudio: React.FC<UploadedSnippetPlayerProps> = ({
  defaultWindowSec = 3,
  onChange,
}) => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [sampleRate, setSampleRate] = useState(SPECTROGRAM_FALLBACK_SAMPLE_RATE);
  const [windowStart, setWindowStart] = useState<number>(0); // seconds
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const spectroContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWindowStartRef = useRef<number>(0);

  const removeFile = () => {
    setAudioFile(null);
    setAudioUrl(null);
    setDuration(null);
    setSampleRate(SPECTROGRAM_FALLBACK_SAMPLE_RATE);
    setWindowStart(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset input
    }
    if (audioRef.current) {
      audioRef.current.src = "";
    }
  };

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setDuration(null);
    setSampleRate(SPECTROGRAM_FALLBACK_SAMPLE_RATE);
    setWindowStart(0);
  };

  useEffect(() => {
    if (!audioFile) return;
    let cancelled = false;
    const ctx = new AudioContext();
    void audioFile.arrayBuffer().then((buf) => {
      if (cancelled) return;
      return ctx.decodeAudioData(buf.slice(0));
    }).then((decoded) => {
      if (cancelled || !decoded) return;
      if (decoded.sampleRate > 0) setSampleRate(decoded.sampleRate);
    }).catch(() => {
      /* keep fallback sample rate */
    }).finally(() => {
      void ctx.close();
    });
    return () => {
      cancelled = true;
      void ctx.close();
    };
  }, [audioFile]);

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(Math.round(audioRef.current.duration));
    }
  };

  const windowEnd = useMemo(() => {
    if (duration == null) return windowStart + defaultWindowSec;
    return Math.min(windowStart + defaultWindowSec, duration);
  }, [windowStart, duration, defaultWindowSec]);

  useEffect(() => {
    onChange?.({
      audioFile,
      startSec: windowStart,
      endSec: windowEnd,
    });
  }, [audioFile, windowStart, windowEnd, onChange]);

  const clampWindowStart = (value: number) => {
    if (duration == null) return value;
    const maxStart = Math.max(0, duration - defaultWindowSec);
    const clamped = Math.min(Math.max(0, value), maxStart);
    return Math.round(clamped);
  };

  const handleOverlayMouseDown = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    if (!duration || !spectroContainerRef.current) return;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWindowStartRef.current = windowStart;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!duration || !spectroContainerRef.current) return;
      const rect = spectroContainerRef.current.getBoundingClientRect();
      const deltaPx = e.clientX - dragStartXRef.current;
      const secondsPerPx = duration / rect.width;
      const deltaSec = deltaPx * secondsPerPx;
      const newStart = clampWindowStart(
        dragStartWindowStartRef.current + deltaSec,
      );
      setWindowStart(newStart);
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, duration, defaultWindowSec]);

  const overlayStyle = useMemo(() => {
    if (!duration) return { leftPercent: 0, widthPercent: 0 };
    const total = duration;
    const leftPercent = (windowStart / total) * 100;
    const widthPercent = (defaultWindowSec / total) * 100;
    return { leftPercent, widthPercent };
  }, [windowStart, duration, defaultWindowSec]);

  const startDisplay = Math.round(windowStart);
  const endDisplay = Math.round(windowEnd);
  const durationDisplay = duration ?? 0;

  return (
    <Form.Item
      label="Choose Audio"
      name="audio"
      rules={[{ required: true, message: "Please select an audio" }]}
      tooltip="Select an audio for the similarity feed"
    >
      <div className="space-y-4">
        {/* Improved File Upload UI */}
        <div className="space-y-3">
          <label className="block text-sm font-medium mb-2">
            Upload audio (WAV recommended)
          </label>

          {audioFile ? (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-blue-600 font-bold text-lg">🎵</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {audioFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md flex items-center space-x-1 whitespace-nowrap ml-2"
                  title="Remove file"
                >
                  <span className="text-xs">✕</span>
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="audio-upload"
              className="block p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer text-center"
            >
              <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-2xl text-blue-600">📁</span>
              </div>
              <p className="text-lg font-medium text-gray-900 mb-1">
                Upload audio file
              </p>
              <input
                id="audio-upload"
                ref={fileInputRef}
                type="file"
                accept="audio/wav,audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Hidden audio */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onLoadedMetadata={handleAudioLoadedMetadata}
            style={{ display: "none" }}
          />
        )}

        {/* Spectrogram + draggable window */}
        {audioUrl && (
          <div ref={spectroContainerRef} style={{ position: "relative" }}>
            <SnippetSpectrogramPlayer
              key={`${audioUrl}-${sampleRate}`}
              src={audioUrl}
              sampleRate={sampleRate}
              durationSec={duration ?? undefined}
              specHeight={250}
              navigator={false}
              settings={false}
              dark={false}
              colormap="viridis"
            />

            {duration && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                }}
              >
                <div
                  onMouseDown={handleOverlayMouseDown}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    height: "80%",
                    left: `${overlayStyle.leftPercent}%`,
                    width: `${overlayStyle.widthPercent}%`,
                    backgroundColor: "transparent",
                    borderLeft: "2px solid #f97316",
                    borderRight: "2px solid #f97316",
                    cursor: "grab",
                    pointerEvents: "auto",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Info + actions with integer display */}
        {duration != null && (
          <div className="flex justify-between text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
            <span>
              Start: <strong>{startDisplay}s</strong>
            </span>
            <span>
              End: <strong>{endDisplay}s</strong>
            </span>
            <span>
              Total: <strong>{durationDisplay}s</strong>
            </span>
          </div>
        )}
      </div>
    </Form.Item>
  );
};
