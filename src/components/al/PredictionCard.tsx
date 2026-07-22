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
import { Skeleton, Tooltip, Button } from "antd";
import { SoundOutlined, AudioOutlined } from "@ant-design/icons";
import { SnippetSpectrogramPlayer } from "../SnippetSpectrogramPlayer";
import type { SnippetAudioResult } from "../../types";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { FeedbackButtons } from "./FeedbackButtons";
import { snippetApi } from "../../services/api";
import { useInViewport } from "../../hooks/useInViewport";
import type { PAMPrediction } from "../../types/al";
import { usePhaseConfig } from "../../studyPhases";
import { useDatasetSpectrogramConfig } from "../../hooks/useDatasetSpectrogramConfig";
import {
  spectrogramChromeHeight,
  spectrogramLayoutHeights,
} from "../../utils/spectrogramConfig";

interface Props {
  prediction: PAMPrediction;
  recordingName?: string;
  /**
   * A single stable callback shared by every card (not curried/cached per
   * card by the caller) — the card identifies itself via its own snippet id
   * so the prop reference never changes, which React.memo relies on.
   */
  cardRef?: (snippetId: number, el: HTMLDivElement | null) => void;
  /** Height in px for the blind snap card (measured from scroll container in PredictionFeed). */
  cardHeightPx?: number;
  /** Labels hydrated from /api/pam-al/snippet-labels (survive refresh). */
  serverLabels?: string[];
  /** Dataset-wide quick labels resolved once by AnnotationHub. */
  quickLabels?: string[];
  quickLabelsLoading?: boolean;
  /** Scroll container for lazy-load visibility (must match feed overflow root). */
  scrollRoot?: Element | null;
  /** Eager-load audio (first feed card) without waiting for intersection. */
  loadAudioImmediately?: boolean;
  /** Called when the user wants to find similar snippets to this one. */
  onFindSimilar?: (snippetId: number) => void;
  /** Suppress the inline blind-mode header (a sticky header is rendered above the feed instead). */
  hideHeader?: boolean;
  /** Suppress the inline blind-mode label area (a sticky label bar is rendered below the feed instead). */
  hideLabels?: boolean;
}

const PredictionCardImpl: React.FC<Props> = ({
  prediction,
  recordingName,
  cardRef,
  cardHeightPx,
  serverLabels,
  quickLabels = [],
  quickLabelsLoading = false,
  scrollRoot,
  loadAudioImmediately = false,
  onFindSimilar,
  hideHeader = false,
  hideLabels = false,
}) => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const datasetSpectrogram = useDatasetSpectrogramConfig(selectedDatasetId);
  const spectrogramBandKey = useMemo(
    () =>
      `${datasetSpectrogram?.spectrogram_f_min_hz ?? ""}:${datasetSpectrogram?.spectrogram_f_max_hz ?? ""}`,
    [datasetSpectrogram],
  );
  const activeSnippetId = useAppSelector((state) => state.al.activeSnippetId);
  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const isSelected = activeSnippetId === prediction.snippet_id;
  // feedbacks are keyed by snippet_id
  const hasFeedback = !!feedbacks[prediction.snippet_id];
  const recordingId = prediction.recording_id;
  const recordingLabel =
    recordingName ??
    (typeof recordingId === "number" ? `Recording #${recordingId}` : null);

  const localRef = useRef<HTMLDivElement | null>(null);
  // Keep the actual element in state so viewport logic re-runs when ref is set.
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const snippetId = prediction.snippet_id;
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
      setCardEl(el);
      if (cardRef) cardRef(snippetId, el);
    },
    [cardRef, snippetId],
  );

  const inView = useInViewport(cardEl, {
    root: scrollRoot ?? null,
    rootMargin: "600px 0px",
  });

  // Debounce every path that can trigger an audio fetch + spectrogram
  // render (~75ms+ of real DSP work, measured). During a fast scroll
  // (fling / scrollbar drag), each of these fires for a *different* card on
  // nearly every frame: `loadAudioImmediately` follows the virtualized
  // window's first index, `isSelected` follows the scroll-centered card
  // (auto-selected as the feed scrolls), and `inView` follows the
  // intersection observer. Loading eagerly on all three meant dozens of
  // distinct snippets were fully decoded+rendered per second during a fast
  // scroll even though the user never landed on any of them — that's what
  // made scrolling feel stuck. Only start the expensive work once the same
  // card has actually held one of these states for a beat.
  const wantsAudio = loadAudioImmediately || isSelected || inView;
  const [settledWantsAudio, setSettledWantsAudio] = useState(false);
  useEffect(() => {
    if (!wantsAudio) {
      setSettledWantsAudio(false);
      return;
    }
    const t = window.setTimeout(() => setSettledWantsAudio(true), 150);
    return () => window.clearTimeout(t);
  }, [wantsAudio]);

  const [audioError, setAudioError] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioSampleRate, setAudioSampleRate] = useState<number>(16000);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [loadedAudioSnippetId, setLoadedAudioSnippetId] = useState<
    number | null
  >(null);
  const isBlind = phase.ui.labelingMode === "blind";

  // ── Blind-mode height computation ──────────────────────────────────────
  // Card fills the scroll-snap viewport. Spectrogram takes the upper portion;
  // the label area below is fixed at LABEL_AREA_H px so the search + chips fit.
  const HEADER_H = 49;
  const BODY_PAD_Y = 24; // py-3 top + py-3 bottom
  const LABEL_AREA_H = 248; // reserved height for search input + chip rows (larger chips need more)
  const SPEC_WIDTH = "min(100%, 1200px)";

  const [blindSpecHeight, setBlindSpecHeight] = useState<number>(300);
  const blindSpecBlockHeight = useMemo(
    () => spectrogramLayoutHeights(blindSpecHeight).blockHeight,
    [blindSpecHeight],
  );

  const computeBlindSpecHeightRef = useRef<() => void>(() => {});

  computeBlindSpecHeightRef.current = () => {
    const cardH =
      typeof cardHeightPx === "number"
        ? cardHeightPx
        : Math.max(560, window.innerHeight - 180);
    // When the label area is hoisted to a sticky bar (hideLabels), the
    // spectrogram gets that space back and fills the card instead of leaving
    // a blank gap below it.
    const available =
      cardH -
      (hideHeader ? 0 : HEADER_H) -
      BODY_PAD_Y -
      (hideLabels ? 0 : LABEL_AREA_H) -
      8;
    const melBudget = available - spectrogramChromeHeight();
    const cap = hideLabels ? 900 : 600;
    setBlindSpecHeight(Math.max(120, Math.min(cap, melBudget)));
  };

  useLayoutEffect(() => {
    if (!isBlind) return;
    computeBlindSpecHeightRef.current();
    const onResize = () => computeBlindSpecHeightRef.current();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isBlind, cardHeightPx]);

  // Simple in-memory cache so scrolling back doesn't re-download audio.
  // We keep object URLs for the session;
  const cachedAudio = useMemo(
    () => audioUrlCache.get(prediction.snippet_id) ?? null,
    [prediction.snippet_id],
  );

  useLayoutEffect(() => {
    setAudioBlobUrl(null);
    setLoadedAudioSnippetId(null);
    setAudioError(false);
  }, [prediction.snippet_id]);

  useEffect(() => {
    if (cachedAudio) {
      setAudioError(false);
      setAudioBlobUrl(cachedAudio.url);
      setAudioSampleRate(cachedAudio.sampleRate);
      setLoadedAudioSnippetId(prediction.snippet_id);
    } else {
      setAudioBlobUrl(null);
      setLoadedAudioSnippetId(null);
    }
  }, [cachedAudio, prediction.snippet_id]);

  useEffect(() => {
    setAudioAttempt(0);
  }, [prediction.snippet_id]);

  const shouldLoadAudio = settledWantsAudio;

  // Fetch audio when card is visible, selected, or the first feed slot.
  useLayoutEffect(() => {
    const snippetId = prediction.snippet_id;
    if (!shouldLoadAudio) return;

    const cached = audioUrlCache.get(snippetId);
    if (cached) {
      setAudioError(false);
      setAudioBlobUrl(cached.url);
      setAudioSampleRate(cached.sampleRate);
      setLoadedAudioSnippetId(snippetId);
      return;
    }

    const existing = inFlight.get(snippetId);
    if (existing) {
      let cancelled = false;
      void existing.then((audio) => {
        if (!cancelled && audio) {
          setAudioError(false);
          setAudioBlobUrl(audio.url);
          setAudioSampleRate(audio.sampleRate);
          setLoadedAudioSnippetId(snippetId);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const priority = loadAudioImmediately || isSelected;
    setAudioError(false);

    const p = loadSnippetAudio(snippetId, controller.signal, priority).finally(
      () => {
        inFlight.delete(snippetId);
      },
    );

    inFlight.set(snippetId, p);
    let cancelled = false;
    void p.then((audio) => {
      if (cancelled || controller.signal.aborted) return;
      if (audio) {
        setAudioError(false);
        setAudioBlobUrl(audio.url);
        setAudioSampleRate(audio.sampleRate);
        setLoadedAudioSnippetId(snippetId);
      } else {
        // First card occasionally races on initial mount; retry eager loads briefly.
        if (loadAudioImmediately && audioAttempt < 2) {
          window.setTimeout(() => {
            if (!controller.signal.aborted) {
              setAudioAttempt((n) => n + 1);
            }
          }, 220);
          return;
        }
        setAudioError(true);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      inFlight.delete(snippetId);
    };
  }, [
    prediction.snippet_id,
    shouldLoadAudio,
    loadAudioImmediately,
    isSelected,
    audioAttempt,
  ]);

  // ── Blind-mode card: spectrogram + inline label area ──────────────────────
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
      {!hideHeader && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-ibm-sans flex items-center gap-2">
            <span className="flex items-center gap-1">
              <SoundOutlined /> Snippet #{prediction.snippet_id}
            </span>
            {recordingLabel && (
              <span className="text-gray-400">· {recordingLabel}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onFindSimilar && (
              <Tooltip title="Find similar snippets">
                <Button
                  type="text"
                  size="small"
                  icon={<AudioOutlined />}
                  className="text-gray-400 hover:text-blue-500 px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFindSimilar(prediction.snippet_id);
                  }}
                />
              </Tooltip>
            )}
            {hasFeedback && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                Labeled
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Spectrogram ── */}
      <div
        className="shrink-0 px-5 pt-3 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        {!audioBlobUrl && !audioError && shouldLoadAudio && (
          <div
            className="mx-auto"
            style={{ width: SPEC_WIDTH, maxWidth: "100%" }}
          >
            <Skeleton.Input
              active
              block
              style={{
                height: blindSpecBlockHeight,
                borderRadius: 12,
                width: "100%",
              }}
            />
          </div>
        )}
        {!audioBlobUrl && !audioError && !shouldLoadAudio && (
          <div
            className="mx-auto flex items-center justify-center bg-gray-50 text-sm text-gray-400 italic rounded-xl border border-gray-100"
            style={{
              width: SPEC_WIDTH,
              maxWidth: "100%",
              height: blindSpecBlockHeight,
            }}
          >
            Scroll to load audio
          </div>
        )}
        {audioError && (
          <div
            className="mx-auto flex items-center justify-center bg-gray-50 text-sm text-gray-400 italic rounded-xl border border-gray-100"
            style={{
              width: SPEC_WIDTH,
              maxWidth: "100%",
              height: blindSpecBlockHeight,
            }}
          >
            Audio unavailable
          </div>
        )}
        {audioBlobUrl && loadedAudioSnippetId === prediction.snippet_id && (
          <div
            className="mx-auto shrink-0 rounded-xl border border-gray-100 bg-white shadow-sm pb-1 overflow-x-hidden"
            style={{ width: SPEC_WIDTH, maxWidth: "100%" }}
          >
            <SnippetSpectrogramPlayer
              // Include the source URL in the key: when the audio source changes
              // (new snippet), React fully remounts the player so it re-decodes
              // and re-renders the new spectrogram instead of keeping the
              // previously decoded one.
              key={`${prediction.snippet_id}|${audioBlobUrl}|${spectrogramBandKey}|${blindSpecHeight}`}
              src={audioBlobUrl}
              sampleRate={audioSampleRate}
              datasetSpectrogram={datasetSpectrogram}
              durationSec={prediction.duration_sec ?? undefined}
              specHeight={blindSpecHeight}
              navigator={false}
              settings={false}
              dark={false}
              colormap="viridis"
            />
          </div>
        )}
      </div>

      {/* ── Inline label area (omitted when a sticky label bar is used) ── */}
      {!hideLabels && (
        <div
          className="shrink-0 px-4 pb-3 pt-2 border-t border-gray-100 flex flex-col overflow-hidden"
          style={{ height: LABEL_AREA_H }}
          onClick={(e) => e.stopPropagation()}
        >
          <FeedbackButtons
            prediction={prediction}
            serverLabels={serverLabels}
            quickLabels={quickLabels}
            quickLabelsLoading={quickLabelsLoading}
          />
        </div>
      )}
    </div>
  );
};

// Scrolling the virtualized feed re-renders PredictionFeed on every frame;
// without this, every currently-mounted card (spectrogram, audio player,
// label buttons) would re-render on every scroll tick regardless of whether
// its own props actually changed.
export const PredictionCard = React.memo(PredictionCardImpl);
PredictionCard.displayName = "PredictionCard";

// ── Audio cache (module-level) ────────────────────────────────────────────────

const audioUrlCache = new Map<number, SnippetAudioResult>();
const inFlight = new Map<number, Promise<SnippetAudioResult | null>>();
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
): Promise<SnippetAudioResult | null> {
  const release = await audioDownloadAcquire(signal, priority);
  try {
    const audio = await snippetApi.getSnippetAudio(snippetId, signal);
    audioUrlCacheSet(snippetId, audio);
    return audio;
  } catch (e: unknown) {
    const err = e as { name?: string; code?: string };
    if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED")
      return null;
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

function audioUrlCacheSet(snippetId: number, audio: SnippetAudioResult) {
  if (!audioUrlCache.has(snippetId)) {
    LRU.push(snippetId);
  } else {
    const idx = LRU.indexOf(snippetId);
    if (idx >= 0) LRU.splice(idx, 1);
    LRU.push(snippetId);
  }

  audioUrlCache.set(snippetId, audio);

  while (LRU.length > MAX_CACHE) {
    const evict = LRU.shift();
    if (evict === undefined) break;
    const old = audioUrlCache.get(evict);
    if (old) URL.revokeObjectURL(old.url);
    audioUrlCache.delete(evict);
  }
}
