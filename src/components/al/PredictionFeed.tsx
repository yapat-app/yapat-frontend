/**
 * PredictionFeed — phase-aware snippet feed.
 *
 * Behaviour is driven entirely by `phase.feed.mode`:
 *   • "scrollable_topk"        → annotation-style feed with stats, queue, and cards
 *   • "single_card_on_select"  → only the snippet matching `selectedSnippetId`
 *   • "hidden"                 → renders nothing
 */

import React, { useRef, useCallback, useMemo, useEffect, useState } from "react";
import { Spin, Empty, Alert, Card, Progress, Row, Col, Statistic } from "antd";
import { CheckCircleOutlined, SoundOutlined } from "@ant-design/icons";
import { useAppSelector } from "../../hooks";
import { alApi } from "../../services/alApi";
import { PredictionCard } from "./PredictionCard";
import { RetrainControl } from "./RetrainControl";
import { useALSync } from "../../hooks/useALSync";
import { usePhaseConfig } from "../../studyPhases";

export const PredictionFeed: React.FC = () => {
  const { predictions, inferenceLoading, error, selectedSnippetId, feedbacks, selectedDatasetId, snippetSetId } = useAppSelector(
    (state) => state.al,
  );
  const phase = usePhaseConfig();

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Height of the scroll container so each snap card fills exactly one viewport slot.
  const [blindSnapCardHeight, setBlindSnapCardHeight] = useState(560);

  useALSync(cardRefs);

  const setCardRef = useCallback(
    (snippetId: number) => (el: HTMLDivElement | null) => {
      if (el) cardRefs.current.set(snippetId, el);
      else cardRefs.current.delete(snippetId);
    },
    [],
  );

  const isBlind = phase.ui.labelingMode === "blind";

  // Measure the scroll container so each blind card can fill it exactly.
  useEffect(() => {
    if (!isBlind) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setBlindSnapCardHeight(Math.max(480, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isBlind]);

  // Blind mode: hydrate per-snippet labels from the backend so they persist across refresh.
  const [labelsBySnippet, setLabelsBySnippet] = useState<Record<number, string[]>>({});
  useEffect(() => {
    let cancelled = false;
    async function loadLabels() {
      if (!isBlind || !selectedDatasetId) {
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
  }, [isBlind, selectedDatasetId, snippetSetId]);

  // ── Derived stats for Phase 1 header ────────────────────────────────────
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
        <Spin size="large" tip="Running inference…" />
      </div>
    );
  }

  if (!inferenceLoading && predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Empty description="No predictions yet. Configure the model and run inference." />
      </div>
    );
  }

  // ── Single-card mode (Phase 2.x / 3.x) ───────────────────────────────────
  if (phase.feed.mode === "single_card_on_select") {
    const selected = selectedSnippetId !== null
      ? predictions.find((p) => p.snippet_id === selectedSnippetId)
      : undefined;

    if (!selected) {
      return (
        <div className="flex items-center justify-center h-full px-6 text-center">
          <Empty description="Click a point on the projection to inspect that snippet." />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          <PredictionCard
            key={selected.id ?? selected.snippet_id}
            prediction={selected}
            cardRef={setCardRef(selected.snippet_id)}
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

  // ── Scrollable top-K mode (Phase 1.x) ────────────────────────────────────

  // Blind mode: snap-scroll feed; each card fills one viewport slot and contains
  // the spectrogram + inline label area — no separate bottom strip.
  if (isBlind) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2"
          style={{ scrollSnapType: "y mandatory" }}
        >
          <div className="flex flex-col gap-3 w-full max-w-[1200px] mx-auto">
            {predictions.map((p) => (
              <div
                key={p.id ?? p.snippet_id}
                className="snap-start shrink-0 w-full"
                style={{ height: blindSnapCardHeight }}
              >
                <PredictionCard
                  prediction={p}
                  cardRef={setCardRef(p.snippet_id)}
                  cardHeightPx={blindSnapCardHeight}
                  serverLabels={labelsBySnippet[p.snippet_id] ?? []}
                />
              </div>
            ))}

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

  // ── Guided scrollable feed (non-blind P1.x) ──────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed header (stats + progress) */}
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

      {/* Scrollable feed */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="w-full md:w-[85%] max-w-[1400px] mx-auto flex flex-col gap-3">
          {predictions.map((p) => (
            <PredictionCard
              key={p.id ?? p.snippet_id}
              prediction={p}
              cardRef={setCardRef(p.snippet_id)}
            />
          ))}

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
