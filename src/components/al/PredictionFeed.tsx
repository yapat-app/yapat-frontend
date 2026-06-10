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
import { fetchAnnotationsBySnippetIds } from "../../utils/batchFetchAnnotationsBySnippetIds";
import { hydrateClassicAnnotations, setSelectedSnippet, setActiveSnippet } from "../../redux/features/alSlice";
import type { Annotation } from "../../types";
import type { PAMPrediction } from "../../types/al";

export const PredictionFeed: React.FC = () => {
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
  } = useAppSelector((state) => state.al);
  // Backward-compat scalar used by scroll-sync and single-card paths.
  const selectedSnippetId = selectedSnippetIds[0] ?? null;
  const isClassicFeed = feedSource === "classic";
  const phase = usePhaseConfig();

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [recordingNameById, setRecordingNameById] = useState<Record<number, string>>({});

  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [predictions]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, predictions.length));
        }
      },
      { root: scrollContainerRef.current, rootMargin: "200px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [predictions.length, scrollRoot]);

  const bindScrollContainer = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el;
    setScrollRoot(el);
  }, []);

  const [blindSnapCardHeight, setBlindSnapCardHeight] = useState(560);

  const skipScrollIntoViewRef = useRef(false);
  const scrollSyncSuspendedRef = useRef(false);
  const cardVisibilityObserverRef = useRef<IntersectionObserver | null>(null);
  const selectedSnippetIdRef = useRef<number | null>(selectedSnippetId);
  useEffect(() => {
    selectedSnippetIdRef.current = selectedSnippetId;
  }, [selectedSnippetId]);

  useALSync(cardRefs, { skipScrollIntoViewRef });

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
    const scheduleSelect = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        selectCenteredCard();
      });
    };

    const observer = new IntersectionObserver(scheduleSelect, {
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
        const ids = predictions.slice(0, visibleCount).map((p) => p.snippet_id);
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
  }, [dispatch, predictions, visibleCount]);

  const neededRecordingIdsKey = useMemo(() => {
    // Only fetch names for currently visible predictions — computing over all
    // 24k+ predictions would trigger hundreds of paginated bulk requests.
    const ids = Array.from(
      new Set(
        predictions
          .slice(0, visibleCount)
          .map((p) => p.recording_id)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
      ),
    );
    return ids.join(",");
  }, [predictions, visibleCount]);

  useEffect(() => {
    setRecordingNameById({});
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId || !neededRecordingIdsKey) {
      setRecordingNameById({});
      return;
    }
    const neededIds = neededRecordingIdsKey
      .split(",")
      .map(Number)
      .filter((n) => Number.isFinite(n));

    const datasetId = selectedDatasetId;
    const neededSet = new Set(neededIds);
    let cancelled = false;

    async function fetchNames() {
      const next: Record<number, string> = {};
      // Page through the dataset's recordings in bulk (one request per ~1000)
      // instead of fetching each recording id individually — the per-id loop
      // fired thousands of GET /api/recordings/{id} calls and stalled the feed.
      const PAGE = 1000;
      let skip = 0;
      for (;;) {
        if (cancelled) return;
        const page = await recordingApi.getAll({
          dataset_id: datasetId,
          skip,
          limit: PAGE,
        });
        for (const rec of page) {
          const id = Number(rec.id);
          if (!Number.isFinite(id) || !neededSet.has(id)) continue;
          const name =
            (typeof rec.file_name === "string" && rec.file_name) ||
            (typeof rec.name === "string" && rec.name) ||
            null;
          if (name) next[id] = name;
        }
        if (page.length < PAGE) break;
        skip += PAGE;
      }
      if (!cancelled) setRecordingNameById(next);
    }

    void fetchNames().catch(() => {
      if (!cancelled) setRecordingNameById({});
    });

    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, neededRecordingIdsKey]);

  const setCardRef = useCallback(
    (snippetId: number) => (el: HTMLDivElement | null) => {
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

  const isBlind = phase.ui.labelingMode === "blind";

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

  const [labelsBySnippet, setLabelsBySnippet] = useState<Record<number, string[]>>({});
  const feedbackLabelSignature = useMemo(
    () =>
      Object.entries(feedbacks)
        .map(([snippetId, fb]) => `${snippetId}:${fb.action}:${(fb.final_labels ?? []).join(",")}`)
        .sort()
        .join("|"),
    [feedbacks],
  );
  const feedbacksRef = useRef(feedbacks);
  feedbacksRef.current = feedbacks;

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
      const multiSelected = selectedSnippetIds
        .map((id) => predictions.find((p) => p.snippet_id === id))
        .filter((p): p is PAMPrediction => p !== undefined);

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
                    cardRef={setCardRef(p.snippet_id)}
                    cardHeightPx={blindSnapCardHeight}
                    serverLabels={labelsBySnippet[p.snippet_id] ?? []}
                    scrollRoot={scrollRoot}
                    loadAudioImmediately={false}
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
            cardRef={setCardRef(selected.snippet_id)}
            serverLabels={labelsBySnippet[selected.snippet_id] ?? []}
            scrollRoot={scrollRoot}
            loadAudioImmediately
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
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div
          ref={bindScrollContainer}
          className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2"
          style={{ scrollSnapType: "y mandatory" }}
        >
          <div className="flex flex-col gap-3 w-full max-w-[1200px] mx-auto">
            {predictions.map((p, index) => {
              const key = p.id ?? p.snippet_id;
              const height = blindSnapCardHeight;
              if (index >= visibleCount) {
                return (
                  <div
                    key={key}
                    className="snap-start shrink-0 w-full rounded-lg bg-gray-50 border border-gray-100"
                    style={{ height }}
                  />
                );
              }
              if (index === visibleCount - 1) {
                return (
                  <div key={key} className="snap-start shrink-0 w-full" style={{ height }}>
                    <div ref={loadMoreSentinelRef} style={{ height: 0 }} />
                    <PredictionCard
                      prediction={p}
                      recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
                      cardRef={setCardRef(p.snippet_id)}
                      cardHeightPx={height}
                      serverLabels={labelsBySnippet[p.snippet_id] ?? []}
                      scrollRoot={scrollRoot}
                      loadAudioImmediately={index === 0}
                    />
                  </div>
                );
              }
              return (
                <div key={key} className="snap-start shrink-0 w-full" style={{ height }}>
                  <PredictionCard
                    prediction={p}
                    recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
                    cardRef={setCardRef(p.snippet_id)}
                    cardHeightPx={height}
                    serverLabels={labelsBySnippet[p.snippet_id] ?? []}
                    scrollRoot={scrollRoot}
                    loadAudioImmediately={index === 0}
                  />
                </div>
              );
            })}

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
          {predictions.map((p, index) => {
            const key = p.id ?? p.snippet_id;
            if (index >= visibleCount) {
              return (
                <div
                  key={key}
                  className="rounded-lg bg-gray-50 border border-gray-100"
                  style={{ height: 220 }}
                />
              );
            }
            if (index === visibleCount - 1) {
              return (
                <React.Fragment key={key}>
                  <div ref={loadMoreSentinelRef} style={{ height: 0 }} />
                  <PredictionCard
                    prediction={p}
                    recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
                    cardRef={setCardRef(p.snippet_id)}
                    scrollRoot={scrollRoot}
                    loadAudioImmediately={index === 0}
                  />
                </React.Fragment>
              );
            }
            return (
              <PredictionCard
                key={key}
                prediction={p}
                recordingName={typeof p.recording_id === "number" ? recordingNameById[p.recording_id] : undefined}
                cardRef={setCardRef(p.snippet_id)}
                scrollRoot={scrollRoot}
                loadAudioImmediately={index === 0}
              />
            );
          })}

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
