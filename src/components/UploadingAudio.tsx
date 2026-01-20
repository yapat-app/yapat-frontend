import React, { useEffect, useMemo, useRef, useState } from "react";
import SpectrogramPlayer from "react-audio-spectrogram-player";
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
  const [windowStart, setWindowStart] = useState<number>(0); // seconds

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spectroContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWindowStartRef = useRef<number>(0);

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
    setWindowStart(0);
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(Math.round(audioRef.current.duration)); // integer duration [web:245]
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
    return Math.round(clamped); // keep as int [web:245]
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
        {/* Upload */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Upload audio (wav)
          </label>
          <input
            type="file"
            accept="audio/wav,audio/*"
            onChange={handleFileChange}
          />
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
            <SpectrogramPlayer
              key={audioUrl}
              src={audioUrl}
              sampleRate={16000}
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
          <>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Start: {startDisplay}s</span>
              <span>End: {endDisplay}s</span>
              <span>Duration: {durationDisplay}s</span>
            </div>
          </>
        )}
      </div>
    </Form.Item>
  );
};
