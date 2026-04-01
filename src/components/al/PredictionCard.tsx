/**
 * PredictionCard — single card showing a PAM prediction.
 */

import React, { useState, useEffect } from "react";
import { Tag, Tooltip, Skeleton } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { FeedbackButtons } from "./FeedbackButtons";
import { snippetApi } from "../../services/api";
import type { PAMPrediction } from "../../types/al";

interface Props {
  prediction: PAMPrediction;
  cardRef?: (el: HTMLDivElement | null) => void;
}

const confidenceColor = (c: number) =>
  c >= 0.75 ? "#16a34a" : c >= 0.5 ? "#d97706" : "#dc2626";

export const PredictionCard: React.FC<Props> = ({ prediction, cardRef }) => {
  const dispatch = useAppDispatch();
  const selectedSnippetId = useAppSelector(
    (state) => state.al.selectedSnippetId,
  );
  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const isSelected = selectedSnippetId === prediction.snippet_id;
  const hasFeedback = !!feedbacks[prediction.id];

  const [audioError, setAudioError] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  // Fetch audio via axios
  // SpectrogramPlayer computes the spectrogram client-side from the same blob URL.
  useEffect(() => {
    let objectUrl: string | null = null;
    setAudioError(false);
    setAudioBlobUrl(null);
    snippetApi
      .getSnippetAudio(prediction.snippet_id)
      .then((url) => {
        objectUrl = url;
        setAudioBlobUrl(url);
      })
      .catch(() => setAudioError(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [prediction.snippet_id]);

  return (
    <div
      ref={cardRef}
      onClick={() => dispatch(setSelectedSnippet(prediction.snippet_id))}
      className={[
        "rounded-lg border bg-white shadow-sm cursor-pointer transition-all duration-200",
        isSelected
          ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
          : "border-gray-200 hover:border-gray-300 hover:shadow",
        hasFeedback ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-ibm-mono font-semibold text-sm text-gray-800 truncate">
            {prediction.predicted_label}
          </span>
          <Tag
            color={
              prediction.confidence >= 0.75
                ? "success"
                : prediction.confidence >= 0.5
                  ? "warning"
                  : "error"
            }
            className="text-xs flex-shrink-0"
          >
            {(prediction.confidence * 100).toFixed(0)}%
          </Tag>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 font-ibm-sans flex items-center gap-1">
            <SoundOutlined />#{prediction.snippet_id}
          </span>
          <Tooltip
            title={`Confidence: ${(prediction.confidence * 100).toFixed(0)}%`}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: confidenceColor(prediction.confidence),
              }}
            />
          </Tooltip>
        </div>
      </div>

      {/* ── Spectrogram + audio player (SpectrogramPlayer handles both) ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-t border-gray-100"
      >
        {/* Loading skeleton — shown until the blob URL is ready */}
        {!audioBlobUrl && !audioError && (
          <div className="px-4 py-3">
            <Skeleton.Input
              active
              block
              style={{ height: 260, borderRadius: 6 }}
            />
          </div>
        )}

        {/* Error state */}
        {audioError && (
          <div
            className="flex items-center justify-center bg-gray-50 text-xs text-gray-400 italic"
            style={{ height: 260 }}
          >
            Audio unavailable
          </div>
        )}

        {/* Player — rendered once the blob URL is available */}
        {audioBlobUrl && (
          <SpectrogramPlayer
            key={audioBlobUrl}
            src={audioBlobUrl}
            sampleRate={16000}
            specHeight={260}
            navigator={false}
            settings={false}
            dark={false}
            colormap="viridis"
          />
        )}
      </div>

      {/* ── Feedback buttons ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-4 py-3 border-t border-gray-100"
      >
        <FeedbackButtons prediction={prediction} />
      </div>
    </div>
  );
};
