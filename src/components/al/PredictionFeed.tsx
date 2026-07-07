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
import { alApi } from "../../services/alApi";
import { recordingApi } from "../../services/api";
import { PredictionCard } from "./PredictionCard";
import { RetrainControl } from "./RetrainControl";
import { useALSync } from "../../hooks/useALSync";
import { usePhaseConfig } from "../../studyPhases";
import { studyLogger, usePanelDwell } from "../../studyLogging";
import { fetchAnnotationsBySnippetIds } from "../../utils/batchFetchAnnotationsBySnippetIds";
import { hydrateClassicAnnotations, setSelectedSnippet, setActiveSnippet } from "../../redux/features/alSlice";
import type { Annotation } from "../../types";
import type { ALFilterState, PAMPrediction, SampleScores } from "../../types/al";
import type { SortField } from "../../types/sort";
import { isPointVisible } from "../../pages/annotationHub/useScoreHistogramData";
import {
  SCORE_VISIBILITY_MODE,
  SCORE_SLIDER_STYLE,
} from "../../pages/annotationHub/scoreFilterConfig";
import { useRecordingLocations } from "../../pages/annotationHub/useRecordingLocations";
import { useRecordingDateTimes } from "../../pages/annotationHub/useRecordingDateTimes";
import { dateStringToEpochDay } from "../../pages/annotationHub/dateTimeFilterHelpers";

const FEED_PAGE_SIZE = 50;
// Stable reference for "no server labels yet" — `labelsBySnippet[id] ?? []`
// would otherwise allocate a new array every render, breaking memoization
// on the PredictionCard consuming it as `serverLabels`.
const EMPTY_LABELS: string[] = [];

function getSortValue(prediction: PAMPrediction, property: SortField["property"]): number {
  if (property === "time") return 0; // no backing data yet — no-op
  if (property === "confidence") return prediction.confidence ?? prediction.scores?.confidence ?? -Infinity;
  if (property === "composite") return prediction.composite_score ?? prediction.scores?.composite ?? -Infinity;
  const key = property as keyof SampleScores;
  const v = prediction.scores?.[key];
  return typeof v === "number" ? v : -Infinity;
}

function applySortFields(predictions: PAMPrediction[], sortFields?: SortField[]): PAMPrediction[] {
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

function hasActiveScoreVisibilityFilters(alFilters: ALFilterState): boolean {
  const visibility = alFilters.visibility;
  const keys = visibility.propertyKeys ?? [];
  const ranges = visibility.ranges ?? {};
  return keys.some((key: string) => {
    const [lo, hi] = ranges[key] ?? [0, 1];
    return lo > 0 || hi < 1;
  });
}

interface PredictionFeedProps {
  onFindSimilar?: (snippetId: number) => void;
  /** Suppress the per-card header (a sticky header is rendered above the feed instead). */
  hideCardHeader?: boolean;
  /** Client-side multi-field sort applied before rendering the feed. */
  sortFields?: SortField[];
  /**
   * Turns on the live client-side filter pipeline below (status, tags,
   * location, model scores). Defaults to off so callers that never pass any
   * of the filter props keep showing every prediction, unfiltered.
   */
  enableClientFilters?: boolean;
  filterAnnotationStatus?: "any" | "annotated" | "unannotated";
  filterLocations?: string[];
  filterDateRange?: [number, number] | null;
  filterTimeRange?: [number, number] | null;
  localLabelScope?: string[];
  quickLabels?: string[];
  quickLabelsLoading?: boolean;
}

export const PredictionFeed: React.FC<PredictionFeedProps> = ({
  onFindSimilar,
  hideCardHeader = false,
  sortFields,
  enableClientFilters = false,
  filterAnnotationStatus = "any",
  filterLocations = [],
  filterDateRange = null,
  filterTimeRange = null,
  localLabelScope = [],
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
    snippetSetId,
    feedSource,
    alFilters,
  } = useAppSelector((state) => state.al);
  // Backward-compat scalar used by scroll-sync and single-card paths.
  const selectedSnippetId = selectedSnippetIds[0] ?? null;
  const isClassicFeed = feedSource === "classic";
  const phase = usePhaseConfig();
  const isBlind = phase.ui.labelingMode === "blind";

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [recordingNameById, setRecordingNameById] = useState<Record<number, string>>({});
  const [labelsBySnippet, setLabelsBySnippet] = useState<Record<number, string[]>>({});

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
  // Cheap: sets a ref + resets an idle timer, no React state / re-render.
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

  const { locationByRecordingId: recordingLocationById, loading: recordingLocationsLoading } =
    useRecordingLocations(enableClientFilters ? selectedDatasetId : null);
  const recordingDateTimeById = useRecordingDateTimes(
    enableClientFilters ? selectedDatasetId : null,
  );
  const sortFieldsKey = useMemo(
    () =>
      (sortFields ?? [])
        .filter((f) => !f.disabled)
        .map((f) => `${f.property}:${f.direction}`)
        .join("|"),
    [sortFields],
  );
  const scoreVisibilityKey = useMemo(() => {
    const visibility = alFilters.visibility;
    const keys = visibility.propertyKeys ?? [];
    return keys
      .map((key) => `${key}:${(visibility.ranges?.[key] ?? [0, 1]).join(",")}`)
      .join("|");
  }, [alFilters.visibility]);
  const feedViewKey = useMemo(
    () =>
      [
        enableClientFilters ? "filters:on" : "filters:off",
        filterAnnotationStatus,
        filterLocations.join("\u0000"),
        filterDateRange ? filterDateRange.join(",") : "none",
        filterTimeRange ? filterTimeRange.join(",") : "none",
        localLabelScope.join("\u0000"),
        sortFieldsKey,
        scoreVisibilityKey,
      ].join("\u0001"),
    [
      enableClientFilters,
      filterAnnotationStatus,
      filterLocations,
      filterDateRange,
      filterTimeRange,
      localLabelScope,
      sortFieldsKey,
      scoreVisibilityKey,
    ],
  );

  const filteredAndSorted = useMemo(() => {
    if (!enableClientFilters) return applySortFields(predictions, sortFields);

    let result = predictions;

    if (filterAnnotationStatus !== "any") {
      const wantAnnotated = filterAnnotationStatus === "annotated";
      result = result.filter((p) => {
        const hasLabel =
          Boolean(feedbacks[p.snippet_id]) || (labelsBySnippet[p.snippet_id]?.length ?? 0) > 0;
        return hasLabel === wantAnnotated;
      });
    }

    if (localLabelScope.length > 0) {
      const scopeSet = new Set(localLabelScope);
      result = result.filter((p) => (p.predicted_labels ?? []).some((label) => scopeSet.has(label)));
    }

    // While the recording->location map is still loading, don't hide items —
    // otherwise everything briefly disappears the moment a location filter is
    // picked, until the fetch resolves (it then snaps to the correct set).
    if (filterLocations.length > 0 && !recordingLocationsLoading) {
      const locationSet = new Set(filterLocations);
      result = result.filter((p) => {
        if (typeof p.recording_id !== "number") return false;
        const location = recordingLocationById.get(p.recording_id);
        return location !== undefined && locationSet.has(location);
      });
    }

    if (filterDateRange) {
      const [startDay, endDay] = filterDateRange;
      result = result.filter((p) => {
        if (typeof p.recording_id !== "number") return false;
        const dt = recordingDateTimeById.get(p.recording_id);
        if (!dt) return false;
        const epochDay = dateStringToEpochDay(dt.date);
        return epochDay >= startDay && epochDay <= endDay;
      });
    }

    if (filterTimeRange) {
      const [startSeconds, endSeconds] = filterTimeRange;
      result = result.filter((p) => {
        if (typeof p.recording_id !== "number") return false;
        const dt = recordingDateTimeById.get(p.recording_id);
        if (!dt) return false;
        return dt.timeSeconds >= startSeconds && dt.timeSeconds <= endSeconds;
      });
    }

    if (hasActiveScoreVisibilityFilters(alFilters)) {
      result = result.filter((p) =>
        isPointVisible(p.scores, alFilters, SCORE_VISIBILITY_MODE, SCORE_SLIDER_STYLE),
      );
    }

    return applySortFields(result, sortFields);
  }, [
    enableClientFilters,
    predictions,
    feedbacks,
    labelsBySnippet,
    filterAnnotationStatus,
    localLabelScope,
    filterLocations,
    recordingLocationById,
    recordingLocationsLoading,
    filterDateRange,
    filterTimeRange,
    recordingDateTimeById,
    alFilters,
    sortFields,
  ]);

  // Reset pagination whenever the filtered list changes, following React's
  // "adjust state during render" pattern (avoids a cascading effect render).
  const [prevFilteredForPaging, setPrevFilteredForPaging] = useState(filteredAndSorted);
  if (filteredAndSorted !== prevFilteredForPaging) {
    setPrevFilteredForPaging(filteredAndSorted);
    setVisibleCount(FEED_PAGE_SIZE);
  }

  const prevFeedViewKeyRef = useRef(feedViewKey);
  useLayoutEffect(() => {
    if (prevFeedViewKeyRef.current === feedViewKey) return;
    prevFeedViewKeyRef.current = feedViewKey;
    // `visibleCount` is already reset during render (the prevFilteredForPaging
    // pattern above) since a feed-view change produces a new filtered list.
    // Here we only reset the DOM scroll position; the blind-window recompute
    // effect then re-derives the visible card window from the new scrollTop.
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
  }, [feedViewKey]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + FEED_PAGE_SIZE, filteredAndSorted.length));
        }
      },
      { root: scrollContainerRef.current, rootMargin: "200px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [filteredAndSorted.length, scrollRoot]);

  const [blindSnapCardHeight, setBlindSnapCardHeight] = useState(560);

  // ── Blind feed windowing ────────────────────────────────────────────────
  // True virtualization: only the ~dozen cards around the viewport are
  // rendered, sandwiched between two spacer divs whose heights stand in for the
  // off-screen cards. Every rendered card is a fixed-height `snap-start` slot,
  // so native CSS scroll-snap stays smooth and the scrollbar maps linearly
  // across the whole list. The window is derived from the *live* scrollTop, so
  // dragging the scrollbar anywhere instantly mounts the cards there.
  //
  // Rendering the full N-row list (30k+ slots) every time the window shifts was
  // the perf regression — at 60fps during a fling that meant ~30k element
  // allocations per frame. Spacers keep every render at ~15 elements.
  const BLIND_WINDOW_OVERSCAN = 4;
  const BLIND_SLOT_GAP_PX = 12; // matches the inter-card gap
  const [blindWindow, setBlindWindow] = useState<{ start: number; end: number }>({
    start: 0,
    end: 8,
  });
  const blindSlotSize = blindSnapCardHeight + BLIND_SLOT_GAP_PX;
  const filteredLen = filteredAndSorted.length;
  const recomputeBlindWindow = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const first = Math.floor(el.scrollTop / blindSlotSize);
    const last = Math.ceil((el.scrollTop + el.clientHeight) / blindSlotSize);
    const start = Math.max(0, first - BLIND_WINDOW_OVERSCAN);
    const end = Math.min(filteredLen, last + BLIND_WINDOW_OVERSCAN);
    // Only re-render when the window boundaries actually change — cards are
    // hundreds of px tall, so this fires roughly once per card of scroll.
    setBlindWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [blindSlotSize, filteredLen]);

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
      if (blindScrollRafRef.current !== null) cancelAnimationFrame(blindScrollRafRef.current);
    };
  }, []);

  // Re-window when the list, container, or card height changes (runs before
  // paint so newly-visible cards mount without a blank frame).
  useLayoutEffect(() => {
    if (!isBlind) return;
    recomputeBlindWindow();
  }, [isBlind, filteredAndSorted, blindSnapCardHeight, scrollRoot, recomputeBlindWindow]);

  // The actual card rows to render for the blind feed (small slice, with each
  // row's absolute index preserved for spacer math + audio priority).
  const blindVisibleRows = useMemo(() => {
    if (!isBlind) return [];
    return filteredAndSorted
      .slice(blindWindow.start, blindWindow.end)
      .map((prediction, offset) => ({ prediction, index: blindWindow.start + offset }));
  }, [isBlind, filteredAndSorted, blindWindow]);
  const blindTopSpacer = blindWindow.start * blindSlotSize;
  const blindBottomSpacer = Math.max(0, filteredLen - blindWindow.end) * blindSlotSize;

  // Metadata hydration (annotations + recording names) is expensive — a network
  // batch fetch plus redux dispatches. Debounce it behind a settled copy of the
  // window so a fast scroll doesn't fire a fetch per card crossed; it runs once
  // the scroll pauses. Card audio already lazy-loads on its own settle timer.
  const [hydrationWindow, setHydrationWindow] = useState(blindWindow);
  useEffect(() => {
    if (!isBlind) return;
    const t = window.setTimeout(() => setHydrationWindow(blindWindow), 200);
    return () => window.clearTimeout(t);
  }, [isBlind, blindWindow]);

  // Predictions whose metadata we hydrate — the settled window for the blind
  // feed, or the current page for the other feeds.
  const visiblePredictionWindow = useMemo(
    () =>
      isBlind
        ? filteredAndSorted.slice(hydrationWindow.start, hydrationWindow.end)
        : predictions.slice(0, visibleCount),
    [isBlind, filteredAndSorted, hydrationWindow, predictions, visibleCount],
  );
  const visiblePredictionWindowKey = useMemo(
    () => visiblePredictionWindow.map((p) => p.snippet_id).join(","),
    [visiblePredictionWindow],
  );

  const skipScrollIntoViewRef = useRef(false);
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

  const selectionFeedViewKeyRef = useRef(feedViewKey);
  useEffect(() => {
    if (!enableClientFilters) return;

    const feedViewChanged = selectionFeedViewKeyRef.current !== feedViewKey;
    selectionFeedViewKeyRef.current = feedViewKey;

    if (feedViewChanged) {
      const firstSnippetId = filteredAndSorted[0]?.snippet_id ?? null;
      skipScrollIntoViewRef.current = true;
      dispatch(setSelectedSnippet(firstSnippetId));
      return;
    }

    if (filteredAndSorted.length === 0) {
      if (selectedSnippetId !== null) {
        skipScrollIntoViewRef.current = true;
        dispatch(setSelectedSnippet(null));
      }
      return;
    }

    if (
      selectedSnippetId !== null &&
      filteredAndSorted.some((p) => p.snippet_id === selectedSnippetId)
    ) {
      return;
    }

    const firstSnippetId = filteredAndSorted[0]?.snippet_id;
    if (firstSnippetId === undefined) return;
    skipScrollIntoViewRef.current = true;
    dispatch(setSelectedSnippet(firstSnippetId));
  }, [dispatch, enableClientFilters, feedViewKey, filteredAndSorted, selectedSnippetId]);

  useALSync(cardRefs, { skipScrollIntoViewRef, isUserScrollingRef });

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

  const selectCenteredCard = useCallback(
    (opts?: { force?: boolean }) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      if (!opts?.force && scrollSyncSuspendedRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      let bestId: number | null = null;
      let bestDist = Infinity;
      cardRefs.current.forEach((el, sid) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < containerRect.top || r.top > containerRect.bottom) return;
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
          { snippetId: bestId, source: opts?.force ? "programmatic" : "scroll" },
          { snippetId: bestId },
        );
      }
      if (phase.feed.mode === "single_card_on_select" && selectedSnippetIds.length > 1) {
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
    if (!container || predictions.length === 0) return;

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

    const observer = new IntersectionObserver(scheduleSelectNow, {
      root: container,
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
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
  }, [selectCenteredCard, predictions.length, scrollRoot]);

  useEffect(() => {
    if (predictions.length === 0) return;
    const cur = selectedSnippetIdRef.current;
    const curInFeed =
      cur !== null && predictions.some((p) => p.snippet_id === cur);
    if (curInFeed) return;
    const raf = requestAnimationFrame(() => selectCenteredCard({ force: true }));
    return () => cancelAnimationFrame(raf);
  }, [selectCenteredCard, predictions, visibleCount, scrollRoot]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateSnippetContributors() {
      if (predictions.length === 0) {
        dispatch(hydrateClassicAnnotations({}));
        return;
      }
      try {
        // Derived from the stable string key, not `visiblePredictionWindow`
        // itself — that array gets a new reference on every recompute of
        // `filteredAndSorted` (e.g. every mousemove while dragging a filter
        // slider) even when its contents are unchanged, which would refire
        // this fetch on every tick of a drag instead of once per settled window.
        const ids = visiblePredictionWindowKey
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n));
        const all = await fetchAnnotationsBySnippetIds(ids);
        if (cancelled) return;
        const bySnippet: Record<number, Annotation[]> = {};
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
  }, [dispatch, predictions.length, visiblePredictionWindowKey]);

  const neededRecordingIdsKey = useMemo(() => {
    // Only fetch names for currently visible predictions — computing over all
    // 24k+ predictions would trigger hundreds of paginated bulk requests.
    const ids = Array.from(
      new Set(
        visiblePredictionWindow
          .map((p) => p.recording_id)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
      ),
    );
    return ids.join(",");
  }, [visiblePredictionWindow]);

  // Clear cached recording names when the dataset changes or there is nothing
  // to name, following the "adjust state during render" pattern.
  const namesSourceKey =
    selectedDatasetId && neededRecordingIdsKey ? String(selectedDatasetId) : null;
  const [prevNamesSourceKey, setPrevNamesSourceKey] = useState(namesSourceKey);
  if (namesSourceKey !== prevNamesSourceKey) {
    setPrevNamesSourceKey(namesSourceKey);
    setRecordingNameById({});
  }

  useEffect(() => {
    if (!selectedDatasetId || !neededRecordingIdsKey) return;
    const neededIds = neededRecordingIdsKey
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
  }, [selectedDatasetId, neededRecordingIdsKey]);

  // A single stable callback (created once, never recreated) passed
  // identically to every card — PredictionCard (wrapped in React.memo) calls
  // it with its own snippet id. Currying a fresh/cached closure per id here
  // would either break memoization (new function every render) or require
  // reading a ref cache during render (not allowed) — this sidesteps both.
  const registerCard = useCallback((snippetId: number, el: HTMLDivElement | null) => {
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
  }, []);

  useLayoutEffect(() => {
    if (!isBlind) return;

    const measure = () => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const h = el.clientHeight;
      if (h > 0) setBlindSnapCardHeight(Math.max(480, h));
    };

    // Defer slightly so the new scroll container is fully laid out after
    // switching between single / multi select branches.
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
  }, [isBlind, predictions.length, selectedSnippetIds.length]);

  const feedbackLabelSignature = useMemo(
    () =>
      Object.entries(feedbacks)
        .map(([snippetId, fb]) => `${snippetId}:${fb.action}:${(fb.final_labels ?? []).join(",")}`)
        .sort()
        .join("|"),
    [feedbacks],
  );
  const feedbacksRef = useRef(feedbacks);
  useEffect(() => {
    feedbacksRef.current = feedbacks;
  }, [feedbacks]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabels() {
      if (!isBlind) {
        if (!cancelled) setLabelsBySnippet({});
        return;
      }
      if (isClassicFeed) {
        const map: Record<number, string[]> = {};
        for (const [snippetId, fb] of Object.entries(feedbacksRef.current)) {
          const labels = fb.final_labels ?? [];
          if (labels.length > 0) map[Number(snippetId)] = labels;
        }
        if (!cancelled) setLabelsBySnippet(map);
        return;
      }
      if (!selectedDatasetId) {
        if (!cancelled) setLabelsBySnippet({});
        return;
      }
      try {
        const r = await alApi.getSnippetLabels(selectedDatasetId, snippetSetId ?? undefined);
        if (cancelled) return;
        const map: Record<number, string[]> = {};
        for (const it of r.items) map[it.snippet_id] = it.labels;
        setLabelsBySnippet(map);
      } catch {
        if (!cancelled) setLabelsBySnippet({});
      }
    }
    loadLabels();
    return () => { cancelled = true; };
  }, [isBlind, isClassicFeed, selectedDatasetId, snippetSetId, feedbackLabelSignature]);

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

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load predictions"
        description={error}
        className="m-4"
      />
    );
  }

  if (inferenceLoading && predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
        <p className="text-sm text-gray-400 font-ibm-sans mt-3">Running inference…</p>
      </div>
    );
  }

  if (!inferenceLoading && predictions.length === 0) {
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
          .map((id) => predictions.find((p) => p.snippet_id === id))
          .filter((p): p is PAMPrediction => p !== undefined),
        sortFields,
      );

      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div
            ref={bindScrollContainer}
            className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2"
            style={{ scrollSnapType: "y mandatory" }}
          >
            <div className="flex flex-col gap-3 w-full">
              {multiSelected.map((p) => (
                <div
                  key={p.id ?? p.snippet_id}
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
                    serverLabels={labelsBySnippet[p.snippet_id] ?? EMPTY_LABELS}
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

    // ── Single selection (existing behaviour) ───────────────────────────────
    const selected = predictions.find((p) => p.snippet_id === selectedSnippetIds[0]);

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
            key={selected.id ?? selected.snippet_id}
            prediction={selected}
            recordingName={
              typeof selected.recording_id === "number"
                ? recordingNameById[selected.recording_id]
                : undefined
            }
            cardRef={registerCard}
            serverLabels={labelsBySnippet[selected.snippet_id] ?? EMPTY_LABELS}
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
    if (enableClientFilters && filteredAndSorted.length === 0) {
      return (
        <div className="flex items-center justify-center h-full px-6 text-center">
          <Empty description="No snippets match the current filters." />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {filterLocations.length > 0 && recordingLocationsLoading && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 py-1.5 text-[11px] font-ibm-sans text-blue-700 bg-blue-50 border-b border-blue-200">
            <Spin size="small" />
            Applying location filter…
          </div>
        )}
        <div
          ref={bindScrollContainer}
          className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2"
          style={{ scrollSnapType: "y mandatory" }}
          onScroll={handleBlindScroll}
        >
          <div className="w-full max-w-[1200px] mx-auto">
            {/* Spacer for the off-screen cards above the window. */}
            <div style={{ height: blindTopSpacer }} />
            {blindVisibleRows.map(({ prediction: p, index }) => (
              <div
                key={p.id ?? p.snippet_id}
                className="snap-start shrink-0 w-full"
                style={{ height: blindSnapCardHeight, marginBottom: BLIND_SLOT_GAP_PX }}
              >
                <PredictionCard
                  prediction={p}
                  recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
                  cardRef={registerCard}
                  cardHeightPx={blindSnapCardHeight}
                  serverLabels={labelsBySnippet[p.snippet_id] ?? EMPTY_LABELS}
                  quickLabels={quickLabels}
                  quickLabelsLoading={quickLabelsLoading}
                  scrollRoot={scrollRoot}
                  loadAudioImmediately={index === 0}
                  onFindSimilar={onFindSimilar}
                  hideHeader={hideCardHeader}
                />
              </div>
            ))}
            {/* Spacer for the off-screen cards below the window. */}
            <div style={{ height: blindBottomSpacer }} />

            {inferenceLoading && (
              <div className="flex justify-center py-4">
                <Spin size="small" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        <div className="w-full md:w-[85%] max-w-[1400px] mx-auto flex flex-col gap-3">
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
                  valueStyle={{ color: remainingCount > 0 ? "#cf1322" : "#3f8600" }}
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

      <div ref={bindScrollContainer} className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="w-full md:w-[85%] max-w-[1400px] mx-auto flex flex-col gap-3">
          {predictions.slice(0, visibleCount).map((p, index) => {
            const key = p._isDivider ? `divider-${p.snippet_id}` : (p.id ?? p.snippet_id);

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
                    recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
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
                recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
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
            <div style={{ height: (predictions.length - visibleCount) * (220 + 12) }} />
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
