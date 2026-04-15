/**
 * PredictionCard — single card showing a PAM prediction.
 */

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Tag, Tooltip, Skeleton } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { FeedbackButtons } from "./FeedbackButtons";
import { snippetApi } from "../../services/api";
import { useInViewport } from "../../hooks/useInViewport";
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
  // feedbacks are keyed by snippet_id
  const hasFeedback = !!feedbacks[prediction.snippet_id];

  const labelText = prediction.predicted_label ?? "—";
  const conf = prediction.confidence ?? null;

  const localRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
      if (cardRef) cardRef(el);
    },
    [cardRef],
  );

  const inView = useInViewport(localRef.current, { rootMargin: "600px 0px" });

  const [audioError, setAudioError] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  // Simple in-memory cache so scrolling back doesn't re-download audio.
  // We keep object URLs for the session; a small LRU prevents unbounded growth.
  const cachedUrl = useMemo(() => audioUrlCache.get(prediction.snippet_id) ?? null, [prediction.snippet_id]);

  useEffect(() => {
    if (cachedUrl) {
      setAudioError(false);
      setAudioBlobUrl(cachedUrl);
    } else {
      setAudioBlobUrl(null);
    }
  }, [cachedUrl]);

  // Fetch audio lazily when card is near viewport (or selected).
  // SpectrogramPlayer computes the spectrogram client-side from the same blob URL.
  useEffect(() => {
    if (!inView && !isSelected) return;
    if (audioUrlCache.has(prediction.snippet_id)) return;
    if (inFlight.has(prediction.snippet_id)) return;

    const controller = new AbortController();
    setAudioError(false);

    const p = (async () => {
      // Limit concurrent audio downloads to avoid stalls when many cards enter the viewport.
      const release = await audioDownloadAcquire(controller.signal);
      try {
        const url = await snippetApi.getSnippetAudio(
          prediction.snippet_id,
          controller.signal,
        );
        audioUrlCacheSet(prediction.snippet_id, url);
        setAudioBlobUrl(url);
        return url;
      } catch (e: any) {
        // Ignore cancellations from fast scrolling.
        if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return null;
        setAudioError(true);
        return null;
      } finally {
        release();
      }
    })().finally(() => {
      inFlight.delete(prediction.snippet_id);
    });

    inFlight.set(prediction.snippet_id, p);
    return () => {
      controller.abort();
    };
  }, [prediction.snippet_id, inView, isSelected]);

  return (
    <div
      ref={setRefs}
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
            {labelText}
          </span>
          <Tag
            color={
              (conf ?? 0) >= 0.75
                ? "success"
                : (conf ?? 0) >= 0.5
                  ? "warning"
                  : "error"
            }
            className="text-xs flex-shrink-0"
          >
            {conf === null ? "—" : `${(conf * 100).toFixed(0)}%`}
          </Tag>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 font-ibm-sans flex items-center gap-1">
            <SoundOutlined />#{prediction.snippet_id}
          </span>
          <Tooltip
            title={conf === null ? "Confidence: —" : `Confidence: ${(conf * 100).toFixed(0)}%`}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: confidenceColor(conf ?? 0),
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
        {!audioBlobUrl && !audioError && (inView || isSelected) && (
          <div className="px-4 py-3">
            <Skeleton.Input
              active
              block
              style={{ height: 260, borderRadius: 6 }}
            />
          </div>
        )}

        {/* Not loading yet (lazy) */}
        {!audioBlobUrl && !audioError && !(inView || isSelected) && (
          <div className="flex items-center justify-center bg-gray-50 text-xs text-gray-400 italic" style={{ height: 260 }}>
            Scroll to load audio
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

// ── Audio cache (module-level) ────────────────────────────────────────────────

const audioUrlCache = new Map<number, string>();
const inFlight = new Map<number, Promise<string | null>>();
const LRU: number[] = [];
const MAX_CACHE = 40;

// ── Simple concurrency limiter for audio downloads ───────────────────────────
const MAX_CONCURRENT_AUDIO = 2;
let activeDownloads = 0;
const downloadWaiters: Array<() => void> = [];

async function audioDownloadAcquire(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (activeDownloads < MAX_CONCURRENT_AUDIO) {
    activeDownloads += 1;
    return () => audioDownloadRelease();
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    downloadWaiters.push(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
  activeDownloads += 1;
  return () => audioDownloadRelease();
}

function audioDownloadRelease() {
  activeDownloads = Math.max(0, activeDownloads - 1);
  const next = downloadWaiters.shift();
  if (next) next();
}

function audioUrlCacheSet(snippetId: number, url: string) {
  if (!audioUrlCache.has(snippetId)) {
    LRU.push(snippetId);
  } else {
    const idx = LRU.indexOf(snippetId);
    if (idx >= 0) LRU.splice(idx, 1);
    LRU.push(snippetId);
  }

  audioUrlCache.set(snippetId, url);

  while (LRU.length > MAX_CACHE) {
    const evict = LRU.shift();
    if (evict === undefined) break;
    const old = audioUrlCache.get(evict);
    if (old) URL.revokeObjectURL(old);
    audioUrlCache.delete(evict);
  }
}
