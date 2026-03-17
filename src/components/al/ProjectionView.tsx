/**
 * ProjectionView
 * Left half: 2D feature projection scatter plot.
 *
 * Controls (via ALFilterPanel):
 *   • Visibility Filter — range on any numeric/stepped property
 *   • Color Filter      — colour by any property (continuous gradient or categorical palette)
 *
 * Snapshot updates only after model retraining (uses projectionPredictions).
 */

import React, { useMemo } from "react";
import Plot from "react-plotly.js";
import { Select, Tooltip, Tag } from "antd";
import { SyncOutlined, ExperimentOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
  setSelectedSnippet,
  setSamplingMethod,
  setVisibilityFilter,
  setColorFilter,
} from "../../redux/features/alSlice";
import { getPropertyByKey } from "../../constants/alProperties";
import { resolveColor } from "../../utils/alColors";
import { ALFilterPanel } from "./ALFilterPanel";
import { DUMMY_PREDICTIONS, enrichWithDevScores } from "../../dev/dummyPredictions";
import type { SamplingMethod, PAMPrediction, SampleScores } from "../../types/al";

const { Option } = Select;

// ── Default colours ───────────────────────────────────────────────────────────
const DEFAULT_COLOR = "#6366f1";
const SELECTED_COLOR = "#facc15";
const HIDDEN_COLOR = "#d1d5db";

// ── Dummy 2-D coordinate generator (fallback when no real embeddings) ─────────

const seedRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const dummyCoords = (predictions: PAMPrediction[]): [number, number][] => {
  const rand = seedRandom(42);
  const labelOffsets = new Map<string, [number, number]>();
  let idx = 0;
  predictions.forEach((p) => {
    if (!labelOffsets.has(p.predicted_label)) {
      const angle = (idx / Math.max(1, predictions.length)) * 2 * Math.PI;
      labelOffsets.set(p.predicted_label, [Math.cos(angle) * 3, Math.sin(angle) * 3]);
      idx++;
    }
  });
  return predictions.map((p) => {
    const [ox, oy] = labelOffsets.get(p.predicted_label) ?? [0, 0];
    return [ox + (rand() - 0.5) * 2, oy + (rand() - 0.5) * 2];
  });
};

// ── Component ─────────────────────────────────────────────────────────────────

export const ProjectionView: React.FC = () => {
  const dispatch = useAppDispatch();
  const {
    predictions,
    projectionPredictions,
    selectedSnippetId,
    samplingMethod,
    alFilters,
    lastRetrainJob,
    retrainLoading,
  } = useAppSelector((state) => state.al);

  // ── Source predictions (retrain snapshot if available, else live, else dummy) ─
  const rawSource = projectionPredictions.length > 0
    ? projectionPredictions
    : predictions;

  // Fall back to dummy data only when no real predictions exist yet
  const isDummy = rawSource.length === 0;
  // Enrich real predictions that are missing scores with deterministic dev scores
  const sourcePredictions = isDummy
    ? DUMMY_PREDICTIONS
    : enrichWithDevScores(rawSource);

  const hasReal2D = sourcePredictions.some(
    (p) => p.embedding_2d && (p.embedding_2d[0] !== 0 || p.embedding_2d[1] !== 0),
  );

  const coords: [number, number][] = useMemo(() => {
    if (hasReal2D)
      return sourcePredictions.map((p) => p.embedding_2d ?? [0, 0] as [number, number]);
    return dummyCoords(sourcePredictions);
  }, [sourcePredictions, hasReal2D]);

  // ── Collect categorical values for dynamic palettes / legends ─────────────
  const allCategoricalValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const p of sourcePredictions) {
      for (const key of ["sound_type", "birdnet_label", "yamnet_label"] as const) {
        const val = p.scores?.[key];
        if (val) {
          if (!result[key]) result[key] = [];
          result[key].push(val);
        }
      }
    }
    return result;
  }, [sourcePredictions]);

  // ── Apply visibility filter ───────────────────────────────────────────────
  const { propertyKey: visKey, range: normRange } = alFilters.visibility;
  const visProp = visKey ? getPropertyByKey(visKey) : null;

  const filtered = useMemo(() => {
    return sourcePredictions.map((p, i) => {
      let visible = true;
      if (visProp && visProp.range) {
        const [pMin, pMax] = visProp.range;
        const domainLo = pMin + normRange[0] * (pMax - pMin);
        const domainHi = pMin + normRange[1] * (pMax - pMin);
        const raw = p.scores?.[visKey as keyof SampleScores] as number | undefined;
        if (raw === undefined || raw === null) {
          visible = false;
        } else {
          visible = raw >= domainLo && raw <= domainHi;
        }
      }
      return { p, coord: coords[i], visible };
    });
  }, [sourcePredictions, coords, visProp, visKey, normRange]);

  // ── Build Plotly traces ───────────────────────────────────────────────────
  const colorKey = alFilters.color.propertyKey;

  const traces = useMemo(() => {
    if (filtered.length === 0) return [];

    const hidden = filtered.filter((f) => !f.visible);
    const visible = filtered.filter((f) => f.visible);

    const hiddenTrace = hidden.length > 0
      ? {
          type: "scatter" as const,
          mode: "markers" as const,
          name: "",
          showlegend: false,
          x: hidden.map((f) => f.coord[0]),
          y: hidden.map((f) => f.coord[1]),
          customdata: hidden.map((f) => f.p.snippet_id),
          marker: { color: HIDDEN_COLOR, size: 4, opacity: 0.25, line: { width: 0 } },
          hovertemplate: "Snippet #%{customdata} (filtered)<extra></extra>",
        }
      : null;

    // Group visible points by predicted label for the legend
    const byLabel = new Map<string, {
      xs: number[]; ys: number[]; ids: number[]; colors: string[]; sizes: number[];
    }>();

    visible.forEach(({ p, coord }) => {
      const label = p.predicted_label;
      if (!byLabel.has(label)) byLabel.set(label, { xs: [], ys: [], ids: [], colors: [], sizes: [] });
      const g = byLabel.get(label)!;
      g.xs.push(coord[0]);
      g.ys.push(coord[1]);
      g.ids.push(p.snippet_id);

      const isSelected = p.snippet_id === selectedSnippetId;
      g.sizes.push(isSelected ? 13 : 6);
      g.colors.push(
        isSelected
          ? SELECTED_COLOR
          : colorKey
          ? resolveColor(p.scores ?? {}, colorKey, allCategoricalValues[colorKey] ?? [])
          : DEFAULT_COLOR,
      );
    });

    const visibleTraces = Array.from(byLabel.entries()).map(([label, g]) => ({
      type: "scatter" as const,
      mode: "markers" as const,
      name: label,
      x: g.xs,
      y: g.ys,
      customdata: g.ids,
      marker: { color: g.colors, size: g.sizes, opacity: 0.88, line: { width: 0 } },
      hovertemplate: `<b>${label}</b><br>Snippet #%{customdata}<extra></extra>`,
    }));

    return hiddenTrace ? [hiddenTrace, ...visibleTraces] : visibleTraces;
  }, [filtered, selectedSnippetId, colorKey, allCategoricalValues]);

  const handlePlotClick = (event: any) => {
    const pt = event.points?.[0];
    if (pt?.customdata !== undefined) {
      dispatch(setSelectedSnippet(pt.customdata as number));
    }
  };

  const visibleCount = filtered.filter((f) => f.visible).length;
  const isWaitingForRetrain = predictions.length > 0 && projectionPredictions.length === 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Dual filter panel ─────────────────────────────────────────── */}
      <ALFilterPanel
        filters={alFilters}
        onVisibilityKeyChange={(key) =>
          dispatch(setVisibilityFilter({ propertyKey: key, range: [0, 1] }))
        }
        onVisibilityRangeChange={(range) =>
          dispatch(setVisibilityFilter({ range }))
        }
        onColorKeyChange={(key) =>
          dispatch(setColorFilter({ propertyKey: key }))
        }
        allCategoricalValues={allCategoricalValues}
      />

      {/* ── Secondary controls ────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 bg-white flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 font-ibm-sans">Sampling method</span>
          <Select
            size="small"
            value={samplingMethod}
            onChange={(v: SamplingMethod) => dispatch(setSamplingMethod(v))}
            style={{ width: 140 }}
          >
            <Option value="uncertainty">Uncertainty</Option>
            <Option value="diversity">Diversity</Option>
            <Option value="density">Density</Option>
            <Option value="random">Random</Option>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <span className="text-xs text-gray-400 font-ibm-sans">
            <strong>{visibleCount}</strong> / <strong>{sourcePredictions.length}</strong> visible
          </span>

          {!hasReal2D && sourcePredictions.length > 0 && (
            <span className="text-xs text-amber-500 font-ibm-sans italic">
              ⚠ Simulated layout
            </span>
          )}

          {lastRetrainJob && (
            <Tooltip title={`Retrain completed at ${lastRetrainJob.completed_at ?? "?"}`}>
              <Tag icon={<ExperimentOutlined />} color="green" className="text-xs">
                Post-retrain view
              </Tag>
            </Tooltip>
          )}
          {isWaitingForRetrain && !retrainLoading && (
            <Tooltip title="Run inference after retrain to update the projection">
              <Tag icon={<SyncOutlined />} color="blue" className="text-xs">
                Updates after retrain
              </Tag>
            </Tooltip>
          )}
          {retrainLoading && (
            <Tag icon={<SyncOutlined spin />} color="processing" className="text-xs">
              Retraining…
            </Tag>
          )}
        </div>
      </div>

      {/* ── Plot area ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Dev-mode notice */}
        {isDummy && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-ibm-sans shadow-sm pointer-events-none">
            <ExperimentOutlined className="text-amber-500" />
            Preview mode — dummy data · run inference to replace
          </div>
        )}
        {!isDummy && rawSource.some((p) => !p.scores) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-ibm-sans shadow-sm pointer-events-none">
            <ExperimentOutlined className="text-blue-400" />
            Filter scores are dummy — backend scores not yet available
          </div>
        )}

        {visibleCount === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            No points in selected range — adjust the visibility filter
          </div>
        ) : (
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 30, r: 10, t: 10, b: 30 },
              showlegend: true,
              legend: {
                font: { size: 10 },
                itemsizing: "constant",
                bgcolor: "rgba(255,255,255,0.85)",
                bordercolor: "#e5e7eb",
                borderwidth: 1,
              },
              xaxis: { showgrid: false, zeroline: false, showticklabels: false },
              yaxis: { showgrid: false, zeroline: false, showticklabels: false },
              paper_bgcolor: "#f7fafc",
              plot_bgcolor: "#f7fafc",
              hovermode: "closest",
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
            onClick={handlePlotClick}
            config={{ displayModeBar: false, responsive: true }}
          />
        )}
      </div>
    </div>
  );
};
