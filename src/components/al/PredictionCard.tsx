/**
 * PredictionCard — single card showing a PAM prediction.
 */

import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { Skeleton } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { FeedbackButtons } from "./FeedbackButtons";
import { snippetApi } from "../../services/api";
import { useInViewport } from "../../hooks/useInViewport";
import type { PAMPrediction } from "../../types/al";
import { usePhaseConfig } from "../../studyPhases";

interface Props {
  prediction: PAMPrediction;
  cardRef?: (el: HTMLDivElement | null) => void;
  /** Height in px for the blind snap card (measured from scroll container in PredictionFeed). */
  cardHeightPx?: number;
  /** Labels hydrated from /api/pam-al/snippet-labels (survive refresh). */
  serverLabels?: string[];
  /** Scroll container for lazy-load visibility (must match feed overflow root). */
  scrollRoot?: Element | null;
  /** Eager-load audio (first feed card) without waiting for intersection. */
  loadAudioImmediately?: boolean;
}

export const PredictionCard: React.FC<Props> = ({
  prediction,
  cardRef,
  cardHeightPx,
  serverLabels,
  scrollRoot,
  loadAudioImmediately = false,
}) => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const selectedSnippetId = useAppSelector(
    (state) => state.al.selectedSnippetId,
  );
  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const isSelected = selectedSnippetId === prediction.snippet_id;
  // feedbacks are keyed by snippet_id
  const hasFeedback = !!feedbacks[prediction.snippet_id];

  const localRef = useRef<HTMLDivElement | null>(null);
  // Keep the actual element in state so viewport logic re-runs when ref is set.
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
      setCardEl(el);
      if (cardRef) cardRef(el);
    },
    [cardRef],
  );

  const inView = useInViewport(cardEl, {
    root: scrollRoot ?? null,
    rootMargin: "600px 0px",
  });

  const [audioError, setAudioError] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  const isBlind = phase.ui.labelingMode === "blind";
  // In blind mode the card fills the viewport; elsewhere use compact heights.
  const specHeight = isBlind ? 0 : phase.id.startsWith("P1.") ? 140 : 220;

  // ── Blind-mode height computation ──────────────────────────────────────
  // Card fills the scroll-snap viewport. Spectrogram takes the upper portion;
  // the label area below is fixed at LABEL_AREA_H px so the search + chips fit.
  const PLAYER_CHROME = 72; // audio controls bar + borders (approx px)
  const HEADER_H = 49;
  const BODY_PAD_Y = 24; // py-3 top + py-3 bottom
  const LABEL_AREA_H = 248; // reserved height for search input + chip rows (larger chips need more)

  const [blindSpecHeight, setBlindSpecHeight] = useState<number>(300);

  useEffect(() => {
    if (!isBlind) return;
    const compute = () => {
      const cardH = typeof cardHeightPx === "number" ? cardHeightPx : Math.max(560, window.innerHeight - 180);
      const available = cardH - HEADER_H - BODY_PAD_Y - LABEL_AREA_H - 8; // 8px divider gap
      setBlindSpecHeight(Math.max(160, Math.min(680, available - PLAYER_CHROME)));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [isBlind, cardHeightPx]);

  // Simple in-memory cache so scrolling back doesn't re-download audio.
  // We keep object URLs for the session; 
  const cachedUrl = useMemo(() => audioUrlCache.get(prediction.snippet_id) ?? null, [prediction.snippet_id]);

  useEffect(() => {
    if (cachedUrl) {
      setAudioError(false);
      setAudioBlobUrl(cachedUrl);
    } else {
      setAudioBlobUrl(null);
    }
  }, [cachedUrl]);

  const shouldLoadAudio = loadAudioImmediately || isSelected || inView;

  // Fetch audio when card is visible, selected, or the first feed slot.
  useLayoutEffect(() => {
    const snippetId = prediction.snippet_id;
    if (!shouldLoadAudio) return;

    const cached = audioUrlCache.get(snippetId);
    if (cached) {
      setAudioError(false);
      setAudioBlobUrl(cached);
      return;
    }

    const existing = inFlight.get(snippetId);
    if (existing) {
      let cancelled = false;
      void existing.then((url) => {
        if (!cancelled && url) {
          setAudioError(false);
          setAudioBlobUrl(url);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const priority = loadAudioImmediately || isSelected;
    setAudioError(false);

    const p = loadSnippetAudio(snippetId, controller.signal, priority).finally(() => {
      inFlight.delete(snippetId);
    });

    inFlight.set(snippetId, p);
    let cancelled = false;
    void p.then((url) => {
      if (cancelled || controller.signal.aborted) return;
      if (url) {
        setAudioError(false);
        setAudioBlobUrl(url);
      } else {
        setAudioError(true);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      inFlight.delete(snippetId);
    };
  }, [prediction.snippet_id, shouldLoadAudio, loadAudioImmediately, isSelected]);

  const isPhase1 = phase.id.startsWith("P1.");

  // ── Blind mode (P1.1 / P1.2): spectrogram + inline label area ─────────────
  if (isBlind) {
    return (
      <div
        ref={setRefs}
        onClick={() => dispatch(setSelectedSnippet(prediction.snippet_id))}
        className={[
          "rounded-xl border bg-white shadow-sm cursor-pointer transition-all duration-200 h-full flex flex-col overflow-hidden",
          isSelected
            ? "border-yellow-400 ring-2 ring-yellow-200 shadow-md"
            : "border-gray-200 hover:border-gray-300 hover:shadow",
        ].join(" ")}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-xs text-gray-500 font-ibm-sans flex items-center gap-1">
            <SoundOutlined /> Snippet #{prediction.snippet_id}
          </span>
          {hasFeedback && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
              Labeled
            </span>
          )}
        </div>

        {/* ── Spectrogram ── */}
        <div
          className="flex-shrink-0 px-5 pt-3 pb-2"
          onClick={(e) => e.stopPropagation()}
        >
          {!audioBlobUrl && !audioError && shouldLoadAudio && (
            <Skeleton.Input
              active
              block
              style={{ height: blindSpecHeight, borderRadius: 12, width: "100%" }}
            />
          )}
          {!audioBlobUrl && !audioError && !shouldLoadAudio && (
            <div
              className="w-full flex items-center justify-center bg-gray-50 text-sm text-gray-400 italic rounded-xl border border-gray-100"
              style={{ height: blindSpecHeight }}
            >
              Scroll to load audio
            </div>
          )}
          {audioError && (
            <div
              className="w-full flex items-center justify-center bg-gray-50 text-sm text-gray-400 italic rounded-xl border border-gray-100"
              style={{ height: blindSpecHeight }}
            >
              Audio unavailable
            </div>
          )}
          {audioBlobUrl && (
            <div className="w-full rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm pb-1">
              <SpectrogramPlayer
                key={audioBlobUrl}
                src={audioBlobUrl}
                sampleRate={16000}
                specHeight={blindSpecHeight}
                navigator={false}
                settings={false}
                dark={false}
                colormap="viridis"
              />
            </div>
          )}
        </div>

        {/* ── Inline label area ── */}
        <div
          className="flex-shrink-0 px-4 pb-3 pt-2 border-t border-gray-100 flex flex-col overflow-hidden"
          style={{ height: LABEL_AREA_H }}
          onClick={(e) => e.stopPropagation()}
        >
          <FeedbackButtons prediction={prediction} {...({ serverLabels } as any)} />
        </div>
      </div>
    );
  }

  // ── Guided Phase 1 (P1.2 etc.): compact two-column card ──────────────────
  if (isPhase1) {
    const labelText = prediction.predicted_label ?? "—";
    return (
      <div
        ref={setRefs}
        onClick={() => dispatch(setSelectedSnippet(prediction.snippet_id))}
        className={[
          "rounded-lg border bg-white shadow-sm cursor-pointer transition-all duration-200",
          isSelected
            ? "border-yellow-400 ring-2 ring-yellow-200 shadow-md"
            : "border-gray-200 hover:border-gray-300 hover:shadow",
          // Do not dim annotated snippets; keep them fully visible.
        ].join(" ")}
      >
        {/* ── Header row ── */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-100">
          <span className="font-ibm-mono font-semibold text-sm text-gray-800 truncate">
            {labelText}
          </span>
          <span className="text-xs text-gray-400 font-ibm-sans flex items-center gap-1 flex-shrink-0">
            <SoundOutlined />#{prediction.snippet_id}
          </span>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex gap-0">
          {/* Left: spectrogram */}
          <div
            className="w-[60%] border-r border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {!audioBlobUrl && !audioError && shouldLoadAudio && (
              <div className="px-4 py-3">
                <Skeleton.Input active block style={{ height: specHeight, borderRadius: 6 }} />
              </div>
            )}
            {!audioBlobUrl && !audioError && !shouldLoadAudio && (
              <div
                className="flex items-center justify-center bg-gray-50 text-xs text-gray-400 italic"
                style={{ height: specHeight }}
              >
                Scroll to load audio
              </div>
            )}
            {audioError && (
              <div
                className="flex items-center justify-center bg-gray-50 text-xs text-gray-400 italic"
                style={{ height: specHeight }}
              >
                Audio unavailable
              </div>
            )}
            {audioBlobUrl && (
              <div className="px-4 py-3">
                <div className="rounded-md overflow-hidden border border-gray-100 bg-white">
                  <SpectrogramPlayer
                    key={audioBlobUrl}
                    src={audioBlobUrl}
                    sampleRate={16000}
                    specHeight={specHeight}
                    navigator={false}
                    settings={false}
                    dark={false}
                    colormap="viridis"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: predicted labels + feedback */}
          <div
            className="w-[40%] flex flex-col gap-3 px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            {prediction.predicted_labels && prediction.predicted_labels.length > 0 ? (
              <div>
                <p className="text-xs text-gray-400 font-ibm-sans mb-1">Predicted labels</p>
                <div className="flex flex-wrap gap-1">
                  {prediction.predicted_labels.map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200"
                    >
                      {lbl}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic font-ibm-sans">No label predicted</p>
            )}
            <div className="border-t border-gray-100" />
            <FeedbackButtons prediction={prediction} />
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 2 / 3: original stacked layout ─────────────────────────────────
  const labelText = prediction.predicted_label ?? "—";
  return (
    <div
      ref={setRefs}
      onClick={() => dispatch(setSelectedSnippet(prediction.snippet_id))}
      className={[
        "rounded-lg border bg-white shadow-sm cursor-pointer transition-all duration-200",
        isSelected
          ? "border-yellow-400 ring-2 ring-yellow-200 shadow-md"
          : "border-gray-200 hover:border-gray-300 hover:shadow",
        // Do not dim annotated snippets; keep them fully visible.
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-ibm-mono font-semibold text-sm text-gray-800 truncate">
            {labelText}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 font-ibm-sans flex items-center gap-1">
            <SoundOutlined />#{prediction.snippet_id}
          </span>
        </div>
      </div>

      {/* ── Spectrogram + audio player (SpectrogramPlayer handles both) ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-t border-gray-100"
      >
        {/* Loading skeleton — shown until the blob URL is ready */}
            {!audioBlobUrl && !audioError && shouldLoadAudio && (
          <div className="px-4 py-3">
            <Skeleton.Input
              active
              block
              style={{ height: specHeight, borderRadius: 6 }}
            />
          </div>
        )}

        {/* Not loading yet (lazy) */}
            {!audioBlobUrl && !audioError && !shouldLoadAudio && (
          <div className="flex items-center justify-center bg-gray-50 text-xs text-gray-400 italic" style={{ height: specHeight }}>
            Scroll to load audio
          </div>
        )}

        {/* Error state */}
        {audioError && (
          <div
            className="flex items-center justify-center bg-gray-50 text-xs text-gray-400 italic"
            style={{ height: specHeight }}
          >
            Audio unavailable
          </div>
        )}

        {/* Player — rendered once the blob URL is available */}
        {audioBlobUrl && (
          <div className="px-4 py-3">
            <div className="rounded-md overflow-hidden border border-gray-100 bg-white">
              <SpectrogramPlayer
                key={audioBlobUrl}
                src={audioBlobUrl}
                sampleRate={16000}
                specHeight={specHeight}
                navigator={false}
                settings={false}
                dark={false}
                colormap="viridis"
              />
            </div>
          </div>
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

async function audioDownloadAcquire(
  signal?: AbortSignal,
  priority = false,
): Promise<() => void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (priority || activeDownloads < MAX_CONCURRENT_AUDIO) {
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

async function loadSnippetAudio(
  snippetId: number,
  signal?: AbortSignal,
  priority = false,
): Promise<string | null> {
  const release = await audioDownloadAcquire(signal, priority);
  try {
    const url = await snippetApi.getSnippetAudio(snippetId, signal);
    audioUrlCacheSet(snippetId, url);
    return url;
  } catch (e: unknown) {
    const err = e as { name?: string; code?: string };
    if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return null;
    return null;
  } finally {
    release();
  }
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
