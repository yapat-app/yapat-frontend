import React, { useMemo } from "react";
import { Spin } from "antd";
import { resolveColor } from "../../../utils/alColors";
import type { PlotPoint } from "./fpvHelpers";

const THUMB_W = 120;
const THUMB_H = 74;

const MiniProjection: React.FC<{
  points: Array<{ p: PlotPoint; coord: [number, number]; visible: boolean }>;
  coordsBySnippet: Record<number, [number, number]> | null;
  selectedSnippetId: number | null;
  /** Selected point's coordinate in THIS method's space (may be outside the subsample). */
  selectedCoord?: [number, number] | null;
  allActualLabels: string[];
  loading?: boolean;
}> = React.memo(
  ({
    points,
    coordsBySnippet,
    selectedSnippetId,
    selectedCoord = null,
    allActualLabels,
    loading = false,
  }) => {
    const base = useMemo(() => {
      if (!coordsBySnippet) return null;

      const pts: Array<{ x: number; y: number; id: number; color: string; r: number }> = [];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      for (const it of points) {
        const id = it.p.snippet_id as number;
        const c = coordsBySnippet[id];
        if (!c) continue;
        const x = c[0];
        const y = c[1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        const actual = (it.p.scores as any)?.actual_label as string | undefined;
        const isLabeled = Boolean(actual);
        pts.push({
          x,
          y,
          id,
          color: isLabeled
            ? resolveColor({ actual_label: actual } as any, "actual_label", allActualLabels)
            : "#9ca3af",
          r: isLabeled ? 2.0 : 1.7,
        });
      }

      if (pts.length === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) return null;

      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const pad = 4;
      const toSvg = (x: number, y: number): [number, number] => {
        const sx = pad + ((x - minX) / spanX) * (THUMB_W - pad * 2);
        const sy = pad + ((y - minY) / spanY) * (THUMB_H - pad * 2);
        return [sx, THUMB_H - sy];
      };

      const screen = new Map<number, [number, number]>();
      for (const c of pts) screen.set(c.id, toSvg(c.x, c.y));

      return { pts, screen, toSvg };
    }, [points, coordsBySnippet, allActualLabels]);

    const baseCircles = useMemo(() => {
      if (!base) return null;
      return base.pts.map((c) => {
        const [sx, sy] = base.screen.get(c.id)!;
        return <circle key={c.id} cx={sx} cy={sy} r={c.r} fill={c.color} opacity={0.9} />;
      });
    }, [base]);

    if (loading) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <Spin size="small" />
        </div>
      );
    }
    if (!coordsBySnippet) {
      return (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
          N/A
        </div>
      );
    }
    if (!base || !baseCircles) return null;

    // Prefer the explicitly-passed coordinate (works even when the selected
    // point is outside the subsample); fall back to the in-cloud lookup.
    const selScreen: [number, number] | null =
      selectedCoord != null
        ? base.toSvg(selectedCoord[0], selectedCoord[1])
        : selectedSnippetId !== null
          ? (base.screen.get(selectedSnippetId) ?? null)
          : null;
    const hasSelection = selScreen !== null;

    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="w-full h-full">
        <g opacity={hasSelection ? 0.4 : 0.9}>{baseCircles}</g>

        {selScreen && (
          <g>
            <circle
              cx={selScreen[0]}
              cy={selScreen[1]}
              r={6}
              fill="none"
              stroke="#facc15"
              strokeWidth={1}
              opacity={0.85}
            />
            <circle
              cx={selScreen[0]}
              cy={selScreen[1]}
              r={4}
              fill="#facc15"
              stroke="#111827"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
    );
  },
);
MiniProjection.displayName = "MiniProjection";

export { MiniProjection };
