/** PredictionFeed — phase-aware snippet feed. */

import React, {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { Spin, Empty, Alert, Card, Progress, Row, Col, Statistic } from "antd";
import { CheckCircleOutlined, SoundOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { recordingApi } from "../../services/api";
import { PredictionCard } from "./PredictionCard";
import { FeedbackButtons } from "./FeedbackButtons";
import { RetrainControl } from "./RetrainControl";
import { useALSync } from "../../hooks/useALSync";
import { usePhaseConfig } from "../../studyPhases";
import { studyLogger, usePanelDwell } from "../../studyLogging";
import { fetchAnnotationsBySnippetIds } from "../../utils/batchFetchAnnotationsBySnippetIds";
import { annotationDisplayLabel } from "../../utils/classicFeedSync";
import {
  hydrateClassicAnnotations,
  setSelectedSnippet,
  setActiveSnippet,
  clearFeedResume,
  runInference,
} from "../../redux/features/alSlice";
import { ExploreRequestError } from "../../services/exploreApi";
import { exploreBootstrapParams } from "../../pages/annotationHub/alInferenceHelpers";
import type { Annotation } from "../../types";
import type { PAMPrediction, SampleScores } from "../../types/al";
import type { SortField } from "../../types/sort";
import type { ExploreFilters } from "../../types/explore";
import { buildExploreSort } from "../../explore/filters";
import {
  EXPLORE_FEED_PAGE_SIZE,
  useExploreFeed,
} from "../../explore/useExploreFeed";
import { useExploreScope } from "../../explore/useExploreScope";

const FEED_PAGE_SIZE = 50;
/**
 * Browsers cap an element's height (~2^24 px in Chromium), so a virtual list
 * of full-viewport cards stops scrolling correctly past a few tens of
 * thousands of rows. Nobody scrolls that far card-by-card; beyond the cap the
 * feed asks the user to narrow the filters instead.
 */
const MAX_VIRTUAL_ROWS = 20_000;

/** Wait for a value to settle before acting on it. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
/**
 * The visible window's ids change on every scroll step, so hydration requests
 * (recording names, annotations) wait for the window to settle.
 */
const FEED_HYDRATION_DEBOUNCE_MS = 250;
// Stable reference for "no server labels yet" — `labels ?? []` would allocate
// a new array every render, breaking memoization on PredictionCard.
const EMPTY_LABELS: string[] = [];

/** Client-side sort for the legacy (non-server) feed — model scores only. */
function getSortValue(prediction: PAMPrediction, property: SortField["property"]): number {
  if (property === "confidence")
    return prediction.confidence ?? prediction.scores?.confidence ?? -Infinity;
  if (property === "composite")
    return prediction.composite_score ?? prediction.scores?.composite ?? -Infinity;
  const key = property as keyof SampleScores;
  const v = prediction.scores?.[key];
  return typeof v === "number" ? v : -Infinity;
}

function applySortFields(
  predictions: PAMPrediction[],
  sortFields: SortField[] | undefined,
): PAMPrediction[] {
  const active = (sortFields ?? []).filter((f) => !f.disabled);
  if (active.length === 0) return predictions;
  return [...predictions].sort((a, b) => {
    for (const field of active) {
      const av = getSortValue(a, field.property);
      const bv = getSortValue(b, field.property);
      if (av === bv) continue;
      const cmp = av < bv ? -1 : 1;
      return field.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

interface PredictionFeedProps {
  onFindSimilar?: (snippetId: number) => void;
  /** Suppress the per-card header (a sticky header is rendered above the feed instead). */
  hideCardHeader?: boolean;
  /** Multi-field sort. Applied by the server in the explore feed. */
  sortFields?: SortField[];
  /**
   * Serve the feed from /api/explore with these filters — every snippet in
   * the dataset, filtered and sorted server-side, loaded page by page. When
   * omitted the feed shows the in-memory predictions unfiltered.
   */
  exploreFilters?: ExploreFilters;
  quickLabels?: string[];
  quickLabelsLoading?: boolean;
}

type FeedRowSlot = { index: number; prediction: PAMPrediction | undefined };

export const PredictionFeed: React.FC<PredictionFeedProps> = ({
  onFindSimilar,
  hideCardHeader = false,
  sortFields,
  exploreFilters,
  quickLabels = [],
  quickLabelsLoading = false,
}) => {
  const dispatch = useAppDispatch();
  const {
    predictions,
    inferenceLoading,
    error,
    selectedSnippetIds,
    feedbacks,
    selectedDatasetId,
    feedSource,
    classicAnnotationsBySnippet,
    feedResumeRequest,
    modelFamilyName,
  } = useAppSelector((state) => state.al);
  // Backward-compat scalar used by scroll-sync and single-card paths.
  const selectedSnippetId = selectedSnippetIds[0] ?? null;
  const isClassicFeed = feedSource === "classic";
  const phase = usePhaseConfig();
  const isBlind = phase.ui.labelingMode === "blind";

  // ── Data source ─────────────────────────────────────────────────────────
  const { scope, revision } = useExploreScope();
  const serverMode = Boolean(exploreFilters) && scope !== null && !isClassicFeed;
  const exploreSort = useMemo(() => buildExploreSort(sortFields), [sortFields]);
  const EMPTY_FILTERS = useMemo<ExploreFilters>(
    () => ({
      annotation_status: "any",
      annotated_species: [],
      predicted_species: [],
      label_scope: [],
      locations: [],
      date_range: null,
      months: [],
      time_range: null,
      score_ranges: {},
      sticky_ids: [],
    }),
    [],
  );
  const feed = useExploreFeed({
    scope,
    filters: exploreFilters ?? EMPTY_FILTERS,
    sort: exploreSort,
    enabled: serverMode,
    revision,
  });

  // Stable callbacks (the controller object itself is rebuilt every render).
  const {
    rowAt: feedRowAt,
    indexOf: feedIndexOf,
    rowById: feedRowById,
  } = feed;

  const legacyRows = useMemo(
    () => (serverMode ? [] : applySortFields(predictions, sortFields)),
    [serverMode, predictions, sortFields],
  );

  const feedTotal = serverMode ? (feed.total ?? 0) : legacyRows.length;
  const rowCount = serverMode ? Math.min(feedTotal, MAX_VIRTUAL_ROWS) : legacyRows.length;
  const rowAt = useCallback(
    (index: number): PAMPrediction | undefined =>
      serverMode ? feedRowAt(index) : legacyRows[index],
    [serverMode, feedRowAt, legacyRows],
  );
  const indexOf = useCallback(
    (snippetId: number): number =>
      serverMode
        ? feedIndexOf(snippetId)
        : legacyRows.findIndex((p) => p.snippet_id === snippetId),
    [serverMode, feedIndexOf, legacyRows],
  );
  const rowById = useCallback(
    (snippetId: number): PAMPrediction | undefined =>
      serverMode
        ? feedRowById(snippetId)
        : predictions.find((p) => p.snippet_id === snippetId),
    [serverMode, feedRowById, predictions],
  );
  const hasRows = serverMode ? feedTotal > 0 : predictions.length > 0;

  const selectedRow =
    selectedSnippetId === null ? undefined : rowById(selectedSnippetId);
  // While the selected row is briefly unavailable (its page reloading after a
  // filter change) keep the last row we had for that snippet, so the sticky
  // label bar neither unmounts nor sees its labels flicker to empty — both of
  // which disturb its autosave.
  const [lastSelectedRow, setLastSelectedRow] = useState<PAMPrediction | null>(
    null,
  );
  if (selectedRow && selectedRow !== lastSelectedRow) {
    setLastSelectedRow(selectedRow);
  }
  const heldSelectedRow: PAMPrediction | null =
    selectedRow ??
    (lastSelectedRow && lastSelectedRow.snippet_id === selectedSnippetId
      ? lastSelectedRow
      : null);

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [recordingNameById, setRecordingNameById] = useState<
    Record<number, string>
  >({});
  const [classicLabelsBySnippet, setClassicLabelsBySnippet] = useState<
    Record<number, string[]>
  >({});

  const labelsFor = useCallback(
    (snippetId: number): string[] => {
      if (serverMode) {
        const row = (feedRowById(snippetId) ??
          (heldSelectedRow?.snippet_id === snippetId
            ? heldSelectedRow
            : undefined)) as { labels?: string[] } | undefined;
        return row?.labels ?? EMPTY_LABELS;
      }
      return classicLabelsBySnippet[snippetId] ?? EMPTY_LABELS;
    },
    [serverMode, feedRowById, heldSelectedRow, classicLabelsBySnippet],
  );

  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const isUserScrollingRef = useRef(false);
  const userScrollIdleTimerRef = useRef<number | null>(null);

  const bindScrollContainer = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el;
    setScrollRoot(el);
  }, []);

  // Flag the feed as being actively scrolled by the user so useALSync's
  // scrollIntoView doesn't fight native scroll momentum / CSS scroll-snap.
  const markUserScrolling = useCallback(() => {
    isUserScrollingRef.current = true;
    if (userScrollIdleTimerRef.current !== null) {
      window.clearTimeout(userScrollIdleTimerRef.current);
    }
    userScrollIdleTimerRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
      userScrollIdleTimerRef.current = null;
    }, 180);
  }, []);
  useEffect(() => {
    return () => {
      if (userScrollIdleTimerRef.current !== null) {
        window.clearTimeout(userScrollIdleTimerRef.current);
      }
    };
  }, []);

  // The question being asked (filters + sort). A new checkpoint after a
  // retrain refreshes the data but is NOT a new question, so it keeps the
  // scroll position and selection.
  const legacySortKey = useMemo(
    () =>
      (sortFields ?? [])
        .filter((f) => !f.disabled)
        .map((f) => `${f.property}:${f.direction}`)
        .join("|"),
    [sortFields],
  );
  const feedViewKey = serverMode ? `explore:${feed.viewKey}` : `legacy:${legacySortKey}`;

  // Reset legacy pagination whenever the list changes, following React's
  // "adjust state during render" pattern.
  const [prevLegacyRows, setPrevLegacyRows] = useState(legacyRows);
  if (legacyRows !== prevLegacyRows) {
    setPrevLegacyRows(legacyRows);
    setVisibleCount(FEED_PAGE_SIZE);
  }

  const prevFeedViewKeyRef = useRef(feedViewKey);
  useLayoutEffect(() => {
    if (prevFeedViewKeyRef.current === feedViewKey) return;
    prevFeedViewKeyRef.current = feedViewKey;
    // Only reset the DOM scroll position; the blind-window recompute effect
    // then re-derives the visible card window from the new scrollTop.
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
  }, [feedViewKey]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(prev + FEED_PAGE_SIZE, legacyRows.length),
          );
        }
      },
      { root: scrollContainerRef.current, rootMargin: "200px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [legacyRows.length, scrollRoot]);

  const [blindSnapCardHeight, setBlindSnapCardHeight] = useState(560);

  // ── Blind feed windowing ────────────────────────────────────────────────
  // True virtualization: only the ~dozen cards around the viewport are
  // rendered, sandwiched between two spacer divs whose heights stand in for the
  // off-screen cards. Every rendered card is a fixed-height `snap-start` slot,
  // so native CSS scroll-snap stays smooth and the scrollbar maps linearly
  // across the whole list. Server rows load page by page as the window moves.
  const BLIND_WINDOW_OVERSCAN = 4;
  const BLIND_SLOT_GAP_PX = 12; // matches the inter-card gap
  const [blindWindow, setBlindWindow] = useState<{
    start: number;
    end: number;
  }>({
    start: 0,
    end: 8,
  });
  const blindSlotSize = blindSnapCardHeight + BLIND_SLOT_GAP_PX;
  const recomputeBlindWindow = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const first = Math.floor(el.scrollTop / blindSlotSize);
    const last = Math.ceil((el.scrollTop + el.clientHeight) / blindSlotSize);
    const start = Math.max(0, Math.min(rowCount, first - BLIND_WINDOW_OVERSCAN));
    const end = Math.min(rowCount, last + BLIND_WINDOW_OVERSCAN);
    // Only re-render when the window boundaries actually change — cards are
    // hundreds of px tall, so this fires roughly once per card of scroll.
    setBlindWindow((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, [blindSlotSize, rowCount]);

  const blindScrollRafRef = useRef<number | null>(null);
  const handleBlindScroll = useCallback(() => {
    markUserScrolling();
    if (blindScrollRafRef.current !== null) return;
    blindScrollRafRef.current = window.requestAnimationFrame(() => {
      blindScrollRafRef.current = null;
      recomputeBlindWindow();
    });
  }, [markUserScrolling, recomputeBlindWindow]);

  useEffect(() => {
    return () => {
      if (blindScrollRafRef.current !== null)
        cancelAnimationFrame(blindScrollRafRef.current);
    };
  }, []);

  // Re-window when the list, container, or card height changes (runs before
  // paint so newly-visible cards mount without a blank frame).
  useLayoutEffect(() => {
    if (!isBlind) return;
    recomputeBlindWindow();
  }, [isBlind, rowCount, blindSnapCardHeight, scrollRoot, recomputeBlindWindow]);

  // Load the pages around the window (one page of look-ahead each way).
  const { ensureRange } = feed;
  useEffect(() => {
    if (!serverMode) return;
    ensureRange(
      Math.max(0, blindWindow.start - EXPLORE_FEED_PAGE_SIZE / 2),
      blindWindow.end + EXPLORE_FEED_PAGE_SIZE / 2,
    );
  }, [serverMode, ensureRange, blindWindow]);

  // The card slots to render for the blind feed; a slot's row may still be
  // loading (rendered as a placeholder of the same height).
  const blindVisibleRows = useMemo<FeedRowSlot[]>(() => {
    if (!isBlind) return [];
    const slots: FeedRowSlot[] = [];
    for (let i = blindWindow.start; i < blindWindow.end; i++) {
      slots.push({ index: i, prediction: rowAt(i) });
    }
    return slots;
  }, [isBlind, blindWindow, rowAt]);
  const blindTopSpacer = blindWindow.start * blindSlotSize;
  const blindBottomSpacer =
    Math.max(0, rowCount - blindWindow.end) * blindSlotSize;

  // Metadata hydration (annotations + recording names) is expensive — debounce
  // it behind a settled copy of the window so a fast scroll doesn't fire a
  // fetch per card crossed.
  const [hydrationWindow, setHydrationWindow] = useState(blindWindow);
  useEffect(() => {
    if (!isBlind) return;
    const t = window.setTimeout(() => setHydrationWindow(blindWindow), 200);
    return () => window.clearTimeout(t);
  }, [isBlind, blindWindow]);

  // Rows whose metadata we hydrate — the settled window for the blind feed,
  // or the current page for the other feeds.
  const visiblePredictionWindow = useMemo(() => {
    if (!isBlind) return legacyRows.slice(0, visibleCount);
    const rows: PAMPrediction[] = [];
    for (let i = hydrationWindow.start; i < hydrationWindow.end; i++) {
      const row = rowAt(i);
      if (row) rows.push(row);
    }
    return rows;
  }, [isBlind, legacyRows, hydrationWindow, rowAt, visibleCount]);
  const visiblePredictionWindowKey = useMemo(
    () => visiblePredictionWindow.map((p) => p.snippet_id).join(","),
    [visiblePredictionWindow],
  );
  const settledWindowKey = useDebouncedValue(
    visiblePredictionWindowKey,
    FEED_HYDRATION_DEBOUNCE_MS,
  );

  const skipScrollIntoViewRef = useRef(false);
  // Briefly held after a selection change that came from OUTSIDE the feed (a
  // projection click), so a stray scroll/layout event can't overwrite the
  // clicked snippet with whatever card happens to be centered.
  const scrollSyncSuspendedRef = useRef(false);
  const cardVisibilityObserverRef = useRef<IntersectionObserver | null>(null);
  const selectedSnippetIdRef = useRef<number | null>(selectedSnippetId);
  // Last snippet id logged as the active/centered card (dedupes scroll spam).
  const lastActiveLoggedRef = useRef<number | null>(null);

  // Dwell tracking for the annotation feed panel.
  usePanelDwell("feed");
  useEffect(() => {
    selectedSnippetIdRef.current = selectedSnippetId;
  }, [selectedSnippetId]);

  useEffect(() => {
    if (skipScrollIntoViewRef.current) {
      skipScrollIntoViewRef.current = false;
      return;
    }
    scrollSyncSuspendedRef.current = true;
    const t = window.setTimeout(() => {
      scrollSyncSuspendedRef.current = false;
    }, 650);
    return () => window.clearTimeout(t);
  }, [selectedSnippetId]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      const el = scrollContainerRef.current;
      if (!el) return;
      el.scrollTo({
        top: Math.max(0, index * blindSlotSize - (el.clientHeight - blindSnapCardHeight) / 2),
        behavior,
      });
    },
    [blindSlotSize, blindSnapCardHeight],
  );

  const selectedIdx = selectedSnippetId === null ? -1 : indexOf(selectedSnippetId);

  // `useALSync` can only scroll to a mounted card. In blind mode the feed
  // renders a small virtualized window, so jump the scroll container directly
  // to the selected snippet's slot when its position is known. Runs as a
  // layout effect so a remount doesn't paint row 0 first.
  useLayoutEffect(() => {
    if (!isBlind) return;
    if (skipScrollIntoViewRef.current) return;
    if (selectedSnippetId === null) return;
    if (cardRefs.current.has(selectedSnippetId)) return;
    if (selectedIdx === -1 || selectedIdx >= rowCount) return;
    scrollToIndex(selectedIdx);
  }, [isBlind, selectedSnippetId, selectedIdx, rowCount, scrollToIndex]);

  // ── Selection follows the question ──────────────────────────────────────
  // A new question (filters/sort) selects its first row once that row loads;
  // an emptied list clears the selection; an existing selection is kept.
  const firstRowId = rowAt(0)?.snippet_id ?? null;
  const pendingFirstSelectRef = useRef<string | null>(null);
  const selectionFeedViewKeyRef = useRef(feedViewKey);
  const listSettled = serverMode ? feed.total !== null && !feed.loading : true;
  useEffect(() => {
    if (!exploreFilters) return;

    if (selectionFeedViewKeyRef.current !== feedViewKey) {
      selectionFeedViewKeyRef.current = feedViewKey;
      pendingFirstSelectRef.current = feedViewKey;
    }
    if (!listSettled) return;

    if (pendingFirstSelectRef.current === feedViewKey) {
      if (firstRowId === null && feedTotal > 0) return; // first page not in yet
      pendingFirstSelectRef.current = null;
      skipScrollIntoViewRef.current = true;
      dispatch(setSelectedSnippet(firstRowId));
      return;
    }

    if (feedTotal === 0) {
      if (selectedSnippetId !== null) {
        skipScrollIntoViewRef.current = true;
        dispatch(setSelectedSnippet(null));
      }
      return;
    }

    // Keep a deliberate selection even when it isn't in the loaded rows.
    if (selectedSnippetId !== null) return;
    if (firstRowId === null) return;
    skipScrollIntoViewRef.current = true;
    dispatch(setSelectedSnippet(firstRowId));
  }, [
    dispatch,
    exploreFilters,
    feedViewKey,
    listSettled,
    firstRowId,
    feedTotal,
    selectedSnippetId,
  ]);

  // ── Resume on the participant's anchor (study-phase change) ─────────────
  const { locate } = feed;
  useEffect(() => {
    if (!serverMode || !feedResumeRequest || !listSettled) return;
    const { anchorSnippetId, nonce } = feedResumeRequest;
    let cancelled = false;
    void (async () => {
      const target =
        anchorSnippetId !== null ? await locate(anchorSnippetId, true) : null;
      if (cancelled) return;
      dispatch(clearFeedResume(nonce));
      if (!target || target.index >= MAX_VIRTUAL_ROWS) return;
      skipScrollIntoViewRef.current = true;
      dispatch(setSelectedSnippet(target.snippetId));
      scrollToIndex(target.index);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverMode, feedResumeRequest, listSettled, locate, dispatch, scrollToIndex]);

  // Auto-scroll-to-selection is disabled in blind mode: a projection click
  // shows the chosen snippet via the on-demand overlay below, and manual
  // scrolling still drives the selection normally.
  useALSync(cardRefs, {
    skipScrollIntoViewRef,
    isUserScrollingRef,
    disabled: isBlind,
  });

  // ── On-demand overlay for the selected snippet ───────────────────────────
  // When the selection isn't in the rendered window (e.g. a projection click on
  // a snippet thousands of rows away, or not loaded yet), render just that
  // snippet in an overlay. It dismisses as soon as the user scrolls the feed.
  const selectionInWindow =
    selectedIdx >= blindWindow.start && selectedIdx < blindWindow.end;
  const { loadRows } = feed;
  useEffect(() => {
    if (!serverMode || selectedSnippetId === null || selectedRow) return;
    void loadRows([selectedSnippetId]);
  }, [serverMode, selectedSnippetId, selectedRow, loadRows]);

  const [overlayDismissedFor, setOverlayDismissedFor] = useState<number | null>(
    null,
  );
  const showAdHoc =
    isBlind &&
    selectedSnippetId !== null &&
    selectedRow !== undefined &&
    !selectionInWindow &&
    overlayDismissedFor !== selectedSnippetId;
  // Read inside selectCenteredCard via ref so a re-render that flips showAdHoc
  // doesn't recreate that callback and re-subscribe the IntersectionObserver.
  const showAdHocRef = useRef(showAdHoc);
  useEffect(() => {
    showAdHocRef.current = showAdHoc;
  }, [showAdHoc]);
  const resolvedAdHocPrediction = showAdHoc ? selectedRow : null;
  // The snippet the shared sticky label bar acts on (see heldSelectedRow).
  const stickyLabelPrediction = heldSelectedRow;

  // ArrowDown/ArrowUp move by exactly one snap slot. Never steal keystrokes
  // while the user is editing a label/search field.
  useEffect(() => {
    if (!isBlind || rowCount === 0) return;

    const handleSnippetArrowKey = (event: KeyboardEvent) => {
      if (
        (event.key !== "ArrowDown" && event.key !== "ArrowUp") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="textbox"]',
          ))
      ) {
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) return;

      const currentIndex =
        selectedIdx >= 0
          ? selectedIdx
          : Math.round(container.scrollTop / blindSlotSize);
      const nextIndex = currentIndex + (event.key === "ArrowDown" ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= rowCount) return;
      const nextPrediction = rowAt(nextIndex);
      event.preventDefault();
      if (!nextPrediction) {
        // Row still loading — move the viewport; selection follows on settle.
        markUserScrolling();
        scrollToIndex(nextIndex, "smooth");
        return;
      }
      const nextSnippetId = nextPrediction.snippet_id;
      setOverlayDismissedFor(nextSnippetId);
      skipScrollIntoViewRef.current = true;
      markUserScrolling();
      dispatch(setSelectedSnippet(nextSnippetId));
      scrollToIndex(nextIndex, "smooth");
    };

    window.addEventListener("keydown", handleSnippetArrowKey);
    return () => window.removeEventListener("keydown", handleSnippetArrowKey);
  }, [
    blindSlotSize,
    dispatch,
    rowAt,
    rowCount,
    isBlind,
    markUserScrolling,
    selectedIdx,
    scrollToIndex,
  ]);

  const selectCenteredCard = useCallback(
    (opts?: { force?: boolean }) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      // A projection click just set the selection from outside the feed —
      // don't let a stray scroll/layout event overwrite it.
      if (!opts?.force && scrollSyncSuspendedRef.current) return;
      // While the overlay is showing (possibly for a long multilabel session)
      // only a genuine scroll/touch/arrow-key on the feed should end it.
      if (!opts?.force && showAdHocRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      let bestId: number | null = null;
      let bestDist = Infinity;
      cardRefs.current.forEach((el, sid) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < containerRect.top || r.top > containerRect.bottom)
          return;
        const cardCenter = r.top + r.height / 2;
        const d = Math.abs(cardCenter - centerY);
        if (d < bestDist) {
          bestDist = d;
          bestId = sid;
        }
      });
      if (bestId === null) return;

      if (bestId !== lastActiveLoggedRef.current) {
        lastActiveLoggedRef.current = bestId;
        studyLogger.log(
          "feed_active_snippet_change",
          {
            snippetId: bestId,
            source: opts?.force ? "programmatic" : "scroll",
          },
          { snippetId: bestId },
        );
      }
      if (
        phase.feed.mode === "single_card_on_select" &&
        selectedSnippetIds.length > 1
      ) {
        // Multi-select: only update which card is "active" — don't reset the selection.
        dispatch(setActiveSnippet(bestId));
      } else if (bestId !== selectedSnippetIdRef.current) {
        skipScrollIntoViewRef.current = true;
        dispatch(setSelectedSnippet(bestId));
      }
    },
    [dispatch, phase.feed.mode, selectedSnippetIds.length],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasRows) return;

    let rafId: number | null = null;
    let settleTimer: number | null = null;
    const scheduleSelect = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        if (rafId !== null) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          selectCenteredCard();
        });
      }, 120);
    };
    const scheduleSelectNow = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        selectCenteredCard();
      });
    };

    const observer = new IntersectionObserver(
      () => {
        if (selectedSnippetIdRef.current === null) {
          scheduleSelectNow();
        } else {
          scheduleSelect();
        }
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    cardVisibilityObserverRef.current = observer;
    cardRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    container.addEventListener("scroll", scheduleSelect, { passive: true });

    return () => {
      observer.disconnect();
      cardVisibilityObserverRef.current = null;
      container.removeEventListener("scroll", scheduleSelect);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [selectCenteredCard, hasRows, scrollRoot]);

  // Legacy feed: when the selection isn't part of the in-memory list, fall
  // back to whatever card is centered. (The server feed keeps deliberate
  // selections — they may simply not be loaded.)
  useEffect(() => {
    if (serverMode || predictions.length === 0) return;
    const cur = selectedSnippetIdRef.current;
    const curInFeed =
      cur !== null && predictions.some((p) => p.snippet_id === cur);
    if (curInFeed) return;
    const raf = requestAnimationFrame(() =>
      selectCenteredCard({ force: true }),
    );
    return () => cancelAnimationFrame(raf);
  }, [serverMode, selectCenteredCard, predictions, visibleCount, scrollRoot]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateSnippetContributors() {
      if (!hasRows) {
        dispatch(hydrateClassicAnnotations({}));
        return;
      }
      try {
        // Derived from the stable string key so a recompute with unchanged
        // contents (e.g. while dragging a filter slider) doesn't refetch.
        const ids = settledWindowKey
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0);
        const all = await fetchAnnotationsBySnippetIds(ids);
        if (cancelled) return;
        const bySnippet: Record<number, Annotation[]> = {};
        for (const id of ids) bySnippet[id] = [];
        for (const ann of all) {
          if (!bySnippet[ann.snippet_id]) bySnippet[ann.snippet_id] = [];
          bySnippet[ann.snippet_id].push(ann);
        }
        dispatch(hydrateClassicAnnotations(bySnippet));
      } catch {
        if (!cancelled) dispatch(hydrateClassicAnnotations({}));
      }
    }
    void hydrateSnippetContributors();
    return () => {
      cancelled = true;
    };
  }, [dispatch, hasRows, settledWindowKey]);

  const neededRecordingIdsKey = useMemo(() => {
    // Only fetch names for the currently visible rows.
    const ids = Array.from(
      new Set(
        visiblePredictionWindow
          .map((p) => p.recording_id)
          .filter(
            (id): id is number => typeof id === "number" && Number.isFinite(id),
          ),
      ),
    );
    return ids.join(",");
  }, [visiblePredictionWindow]);
  const settledRecordingIdsKey = useDebouncedValue(
    neededRecordingIdsKey,
    FEED_HYDRATION_DEBOUNCE_MS,
  );

  // Clear cached recording names when the dataset changes or there is nothing
  // to name, following the "adjust state during render" pattern.
  const namesSourceKey =
    selectedDatasetId && neededRecordingIdsKey
      ? String(selectedDatasetId)
      : null;
  const [prevNamesSourceKey, setPrevNamesSourceKey] = useState(namesSourceKey);
  if (namesSourceKey !== prevNamesSourceKey) {
    setPrevNamesSourceKey(namesSourceKey);
    setRecordingNameById({});
  }

  useEffect(() => {
    if (!selectedDatasetId || !settledRecordingIdsKey) return;
    const neededIds = settledRecordingIdsKey
      .split(",")
      .map(Number)
      .filter((n) => Number.isFinite(n));

    const datasetId = selectedDatasetId;
    let cancelled = false;

    async function fetchNames() {
      if (cancelled) return;
      // Fetch only the specific recording IDs we need in a single request.
      const recs = await recordingApi.getAll({
        dataset_id: datasetId,
        ids: neededIds.join(","),
        limit: neededIds.length,
      });
      if (cancelled) return;
      const next: Record<number, string> = {};
      for (const rec of recs) {
        const id = Number(rec.id);
        if (!Number.isFinite(id)) continue;
        const name =
          (typeof rec.file_name === "string" && rec.file_name) ||
          (typeof rec.name === "string" && rec.name) ||
          null;
        if (name) next[id] = name;
      }
      setRecordingNameById(next);
    }

    void fetchNames().catch(() => {
      if (!cancelled) setRecordingNameById({});
    });

    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, settledRecordingIdsKey]);

  // A single stable callback passed identically to every card — PredictionCard
  // (wrapped in React.memo) calls it with its own snippet id.
  const registerCard = useCallback(
    (snippetId: number, el: HTMLDivElement | null) => {
      const observer = cardVisibilityObserverRef.current;
      if (el) {
        const prev = cardRefs.current.get(snippetId);
        if (prev && prev !== el && observer) observer.unobserve(prev);
        cardRefs.current.set(snippetId, el);
        if (observer) observer.observe(el);
      } else {
        const prev = cardRefs.current.get(snippetId);
        if (prev && observer) observer.unobserve(prev);
        cardRefs.current.delete(snippetId);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (!isBlind) return;

    const measure = () => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const h = el.clientHeight;
      // Card fills exactly one scroll viewport so snap-scroll lands one card at
      // a time and the centered (selected) card is always the visible one.
      if (h > 0) setBlindSnapCardHeight(h);
    };

    const raf = requestAnimationFrame(() => {
      measure();
      const el = scrollContainerRef.current;
      if (el) ro.observe(el);
    });
    const ro = new ResizeObserver(() => measure());
    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Re-run whenever the selection count crosses the single↔multi boundary
    // so we capture the newly-mounted scroll container element.
  }, [isBlind, hasRows, selectedSnippetIds.length]);

  const feedbackLabelSignature = useMemo(
    () =>
      Object.entries(feedbacks)
        .map(
          ([snippetId, fb]) =>
            `${snippetId}:${fb.action}:${(fb.final_labels ?? []).join(",")}`,
        )
        .sort()
        .join("|"),
    [feedbacks],
  );
  const classicAnnotationLabelSignature = useMemo(
    () =>
      Object.entries(classicAnnotationsBySnippet)
        .map(
          ([snippetId, annotations]) =>
            `${snippetId}:${annotations.map(annotationDisplayLabel).join(",")}`,
        )
        .sort()
        .join("|"),
    [classicAnnotationsBySnippet],
  );
  // Classic feed: labels are derived locally from hydrated annotations.
  useEffect(() => {
    if (!isBlind || !isClassicFeed) return;
    const map: Record<number, string[]> = {};
    for (const [snippetId, annotations] of Object.entries(
      classicAnnotationsBySnippet,
    )) {
      const labels = annotations
        .map(annotationDisplayLabel)
        .filter((label): label is string => Boolean(label));
      if (labels.length > 0) map[Number(snippetId)] = labels;
    }
    setClassicLabelsBySnippet(map);
    // classicAnnotationsBySnippet is read via the signature dep on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlind, isClassicFeed, classicAnnotationLabelSignature]);

  // Server feed: when feedback changes, refresh the labels of the rows the
  // user can see (window + selection) in place. Never re-queries the list, so
  // labelling doesn't reshuffle or scroll the feed.
  const { refreshRows } = feed;
  const refreshIdsRef = useRef<number[]>([]);
  useEffect(() => {
    const ids = new Set<number>();
    for (let i = blindWindow.start; i < blindWindow.end; i++) {
      const row = rowAt(i);
      if (row) ids.add(row.snippet_id);
    }
    if (selectedSnippetId !== null) ids.add(selectedSnippetId);
    refreshIdsRef.current = [...ids];
  }, [blindWindow, rowAt, selectedSnippetId]);
  const lastRefreshedSignatureRef = useRef(feedbackLabelSignature);
  useEffect(() => {
    if (!serverMode) return;
    if (lastRefreshedSignatureRef.current === feedbackLabelSignature) return;
    lastRefreshedSignatureRef.current = feedbackLabelSignature;
    const timer = window.setTimeout(() => {
      void refreshRows(refreshIdsRef.current);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [serverMode, feedbackLabelSignature, refreshRows]);

  // The checkpoint's predictions are missing server-side (e.g. cleaned up):
  // regenerate them once for this query; the new inference revision reloads.
  const missingPredictions =
    serverMode &&
    feed.error instanceof ExploreRequestError &&
    feed.error.code === "no_predictions";
  const regeneratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!missingPredictions || !scope || !modelFamilyName) return;
    if (regeneratedForRef.current === feed.queryKey) return;
    regeneratedForRef.current = feed.queryKey;
    dispatch(
      runInference({
        model_family_name: modelFamilyName,
        dataset_id: scope.dataset_id,
        snippet_set_id: scope.snippet_set_id,
        ...exploreBootstrapParams(),
      }),
    );
  }, [missingPredictions, scope, modelFamilyName, feed.queryKey, dispatch]);

  const labeledCount = useMemo(
    () => predictions.filter((p) => !!feedbacks[p.snippet_id]).length,
    [predictions, feedbacks],
  );
  const remainingCount = predictions.length - labeledCount;
  const progressPercent =
    predictions.length > 0
      ? Math.round((labeledCount / predictions.length) * 100)
      : 0;

  if (phase.feed.mode === "hidden") return null;

  if (error && !serverMode) {
    return (
      <Alert
        type="error"
        message="Failed to load predictions"
        description={error}
        className="m-4"
      />
    );
  }

  if (missingPredictions) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Spin size="large" />
        <p className="text-sm text-gray-400 font-ibm-sans mt-3">
          Generating predictions for the current model…
        </p>
      </div>
    );
  }

  if (serverMode && feed.error && feed.total === null) {
    return (
      <Alert
        type="error"
        message="Failed to load the feed"
        description={feed.error.message}
        className="m-4"
      />
    );
  }

  if (serverMode ? feed.loading && feed.total === null : inferenceLoading && predictions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Spin size="large" />
        <p className="text-sm text-gray-400 font-ibm-sans mt-3">
          {serverMode
            ? feed.building
              ? "Preparing this dataset for browsing…"
              : "Loading feed…"
            : "Running inference…"}
        </p>
      </div>
    );
  }

  if (!serverMode && !inferenceLoading && predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Empty
          description={
            isClassicFeed
              ? "No snippets in this feed. Generate a feed to start annotating."
              : "No predictions yet. Configure the model and run inference."
          }
        />
      </div>
    );
  }

  if (phase.feed.mode === "single_card_on_select") {
    // ── Nothing selected ────────────────────────────────────────────────────
    if (selectedSnippetIds.length === 0) {
      return (
        <div className="flex items-center justify-center h-full px-6 text-center">
          <Empty description="Click a point on the projection to inspect that snippet." />
        </div>
      );
    }

    // ── Multi-select: shift+clicked ≥2 points → full-height snap-scroll feed ──
    if (selectedSnippetIds.length > 1) {
      const multiSelected = applySortFields(
        selectedSnippetIds
          .map((id) => rowById(id))
          .filter((p): p is PAMPrediction => p !== undefined),
        sortFields,
      );

      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div
            ref={bindScrollContainer}
            className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2"
            style={{ scrollSnapType: "y mandatory", overflowAnchor: "none" }}
          >
            <div className="flex flex-col gap-3 w-full">
              {multiSelected.map((p) => (
                <div
                  key={p.snippet_id}
                  className="snap-start shrink-0 w-full"
                  style={{ height: blindSnapCardHeight }}
                >
                  <PredictionCard
                    prediction={p}
                    recordingName={
                      typeof p.recording_id === "number"
                        ? recordingNameById[p.recording_id]
                        : undefined
                    }
                    cardRef={registerCard}
                    cardHeightPx={blindSnapCardHeight}
                    serverLabels={labelsFor(p.snippet_id)}
                    quickLabels={quickLabels}
                    quickLabelsLoading={quickLabelsLoading}
                    scrollRoot={scrollRoot}
                    loadAudioImmediately={false}
                    hideHeader={hideCardHeader}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // ── Single selection ─────────────────────────────────────────────────────
    const selected = rowById(selectedSnippetIds[0]);

    if (!selected) {
      return (
        <div className="flex items-center justify-center h-full px-6 text-center">
          <Empty description="Click a point on the projection to inspect that snippet." />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div
          ref={bindScrollContainer}
          className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3"
        >
          <PredictionCard
            key={selected.snippet_id}
            prediction={selected}
            recordingName={
              typeof selected.recording_id === "number"
                ? recordingNameById[selected.recording_id]
                : undefined
            }
            cardRef={registerCard}
            serverLabels={labelsFor(selected.snippet_id)}
            quickLabels={quickLabels}
            quickLabelsLoading={quickLabelsLoading}
            scrollRoot={scrollRoot}
            loadAudioImmediately
            onFindSimilar={onFindSimilar}
            hideHeader={hideCardHeader}
          />
          {phase.ui.showRetrainControls && (
            <div className="sticky bottom-0 bg-[#f7fafc] pt-2 pb-0">
              <RetrainControl />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isBlind) {
    if (rowCount === 0) {
      return (
        <div className="flex items-center justify-center h-full px-6 text-center">
          <Empty
            description={
              serverMode
                ? "No snippets match the current filters."
                : "No predictions yet. Configure the model and run inference."
            }
          />
        </div>
      );
    }
    const truncated = serverMode && feedTotal > MAX_VIRTUAL_ROWS;
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden relative">
        {/* Middle region: the scrollable spectrogram feed, plus the on-demand
            overlay. The overlay covers only this region — never the sticky
            label bar below it. */}
        <div className="flex-1 min-h-0 relative">
          <div
            ref={bindScrollContainer}
            className="absolute inset-0 overflow-y-auto px-3 pt-2 pb-2"
            // overflowAnchor:none is essential for this virtualized list: as the
            // window shifts, the top spacer's height changes, and the browser's
            // default scroll-anchoring would compound that into scrollTop.
            style={{ scrollSnapType: "y mandatory", overflowAnchor: "none" }}
            onScroll={handleBlindScroll}
          >
            <div className="w-full max-w-300 mx-auto">
              {/* Spacer for the off-screen cards above the window. */}
              <div style={{ height: blindTopSpacer }} />
              {blindVisibleRows.map(({ prediction: p, index }) =>
                p ? (
                  <div
                    key={p.snippet_id}
                    className="snap-start shrink-0 w-full"
                    style={{
                      height: blindSnapCardHeight,
                      marginBottom: BLIND_SLOT_GAP_PX,
                    }}
                  >
                    <PredictionCard
                      prediction={p}
                      recordingName={
                        typeof p.recording_id === "number"
                          ? recordingNameById[p.recording_id]
                          : undefined
                      }
                      cardRef={registerCard}
                      cardHeightPx={blindSnapCardHeight}
                      serverLabels={labelsFor(p.snippet_id)}
                      quickLabels={quickLabels}
                      quickLabelsLoading={quickLabelsLoading}
                      scrollRoot={scrollRoot}
                      loadAudioImmediately={index === 0}
                      suppressAudio={showAdHoc}
                      onFindSimilar={onFindSimilar}
                      hideHeader={hideCardHeader}
                      hideLabels
                    />
                  </div>
                ) : (
                  <div
                    key={`pending-${index}`}
                    className="snap-start shrink-0 w-full flex items-center justify-center rounded-xl border border-gray-100 bg-white"
                    style={{
                      height: blindSnapCardHeight,
                      marginBottom: BLIND_SLOT_GAP_PX,
                    }}
                  >
                    <Spin size="small" />
                  </div>
                ),
              )}
              {/* Spacer for the off-screen cards below the window. */}
              <div style={{ height: blindBottomSpacer }} />
              {truncated && blindWindow.end >= rowCount && (
                <div className="py-6 text-center text-xs text-gray-500 font-ibm-sans">
                  Showing the first {MAX_VIRTUAL_ROWS.toLocaleString()} of{" "}
                  {feedTotal.toLocaleString()} snippets — narrow the filters to
                  see the rest.
                </div>
              )}

              {(inferenceLoading || (serverMode && feed.loading)) && (
                <div className="flex justify-center py-4">
                  <Spin size="small" />
                </div>
              )}
            </div>
          </div>

          {showAdHoc && (
            <div
              className="absolute inset-0 z-20 bg-white flex flex-col overflow-hidden"
              // Any scroll/drag gesture over the overlay means "let me browse the
              // feed" — dismiss it (it reappears on the next projection click).
              onWheel={() => setOverlayDismissedFor(selectedSnippetId)}
              onTouchStart={() => setOverlayDismissedFor(selectedSnippetId)}
            >
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {resolvedAdHocPrediction && (
                  <PredictionCard
                    key={resolvedAdHocPrediction.snippet_id}
                    prediction={resolvedAdHocPrediction}
                    recordingName={
                      typeof resolvedAdHocPrediction.recording_id === "number"
                        ? recordingNameById[
                            resolvedAdHocPrediction.recording_id
                          ]
                        : undefined
                    }
                    cardHeightPx={blindSnapCardHeight}
                    serverLabels={labelsFor(resolvedAdHocPrediction.snippet_id)}
                    quickLabels={quickLabels}
                    quickLabelsLoading={quickLabelsLoading}
                    scrollRoot={scrollRoot}
                    loadAudioImmediately
                    onFindSimilar={onFindSimilar}
                    hideHeader={hideCardHeader}
                    hideLabels
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sticky label bar — one shared instance for the whole feed, targeting
            the current snippet. Capped so large quick-label sets scroll inside
            it instead of squashing the spectrograms. */}
        {stickyLabelPrediction && (
          <div
            className="shrink-0 flex flex-col overflow-hidden border-t border-gray-100 bg-white px-4 pt-2 pb-3"
            style={{ maxHeight: "min(34%, 300px)" }}
          >
            <FeedbackButtons
              prediction={stickyLabelPrediction}
              serverLabels={labelsFor(stickyLabelPrediction.snippet_id)}
              quickLabels={quickLabels}
              quickLabelsLoading={quickLabelsLoading}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="w-full md:w-[85%] max-w-350 mx-auto flex flex-col gap-3">
          <Row gutter={12}>
            <Col span={8}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic
                  title="Total Predictions"
                  value={predictions.length}
                  prefix={<SoundOutlined />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic
                  title="Reviewed"
                  value={labeledCount}
                  valueStyle={{ color: "#3f8600" }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Statistic
                  title="Remaining"
                  value={remainingCount}
                  valueStyle={{
                    color: remainingCount > 0 ? "#cf1322" : "#3f8600",
                  }}
                />
              </Card>
            </Col>
          </Row>

          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Progress
              percent={progressPercent}
              status="active"
              size="small"
              strokeColor={{ "0%": "#108ee9", "100%": "#87d068" }}
            />
          </Card>
        </div>
      </div>

      <div
        ref={bindScrollContainer}
        className="flex-1 overflow-y-auto px-4 pb-4"
      >
        <div className="w-full md:w-[85%] max-w-350 mx-auto flex flex-col gap-3">
          {predictions.slice(0, visibleCount).map((p, index) => {
            const key = p._isDivider
              ? `divider-${p.snippet_id}`
              : `snippet-${p.snippet_id}`;
            if (p._isDivider) {
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 py-1"
                  aria-label="Model updated"
                >
                  <div className="flex-1 h-px bg-blue-100" />
                  <span className="text-[11px] text-blue-400 font-ibm-sans whitespace-nowrap select-none">
                    ↻ Model updated · New suggestions below
                  </span>
                  <div className="flex-1 h-px bg-blue-100" />
                </div>
              );
            }

            if (index === visibleCount - 1) {
              return (
                <React.Fragment key={key}>
                  <div ref={loadMoreSentinelRef} style={{ height: 0 }} />
                  <PredictionCard
                    prediction={p}
                    recordingName={
                      typeof p.recording_id === "number"
                        ? recordingNameById[p.recording_id]
                        : undefined
                    }
                    cardRef={registerCard}
                    quickLabels={quickLabels}
                    quickLabelsLoading={quickLabelsLoading}
                    scrollRoot={scrollRoot}
                    loadAudioImmediately={index === 0}
                    onFindSimilar={onFindSimilar}
                  />
                </React.Fragment>
              );
            }
            return (
              <PredictionCard
                key={key}
                prediction={p}
                recordingName={
                  typeof p.recording_id === "number"
                    ? recordingNameById[p.recording_id]
                    : undefined
                }
                cardRef={registerCard}
                quickLabels={quickLabels}
                quickLabelsLoading={quickLabelsLoading}
                scrollRoot={scrollRoot}
                loadAudioImmediately={index === 0}
                onFindSimilar={onFindSimilar}
              />
            );
          })}
          {predictions.length > visibleCount && (
            <div
              style={{
                height: (predictions.length - visibleCount) * (220 + 12),
              }}
            />
          )}

          {inferenceLoading && (
            <div className="flex justify-center py-4">
              <Spin size="small" />
            </div>
          )}

          {phase.ui.showRetrainControls && (
            <div className="sticky bottom-0 bg-[#f7fafc] pt-2 pb-0">
              <RetrainControl />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
