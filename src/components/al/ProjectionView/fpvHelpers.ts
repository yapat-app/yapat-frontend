/** Pure helpers, constants, caches and types for the ProjectionView module. */

import type { FPVPointMetadata, FPVProjection2D } from "../../../types/visualisation";
import type { SampleScores } from "../../../types/al";

// ── Module-level caches (singletons) ─────────────────────────────────────────

export const _fpvPointsCache = new Map<string, FPVPointMetadata[]>();
export const _fpvProjectionCache = new Map<string, FPVProjection2D>();

// ── Key builders ──────────────────────────────────────────────────────────────

export function fpvPointsKey(datasetId: number, embeddingModelId: number): string {
  return `${datasetId}:${embeddingModelId}`;
}

export function fpvProjectionKey(
  datasetId: number,
  embeddingModelId: number,
  method: string,
): string {
  return `${datasetId}:${embeddingModelId}:${method}`;
}

export function fpvScopeKey(datasetId: number, embeddingModelId: number): string {
  return `${datasetId}:${embeddingModelId}`;
}

export function clearFpvCache(datasetId: number, embeddingModelId: number): void {
  _fpvPointsCache.delete(fpvPointsKey(datasetId, embeddingModelId));
  for (const m of ["pca", "umap", "tsne", "isomap"]) {
    _fpvProjectionCache.delete(fpvProjectionKey(datasetId, embeddingModelId, m));
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlotPoint = {
  snippet_id: number;
  predicted_label?: string | null;
  scores?: SampleScores;
};

export type ProjectionMethod = "pca" | "umap" | "tsne" | "isomap";

// ── Constants ─────────────────────────────────────────────────────────────────

export const SELECTED_COLOR = "#facc15";
export const HIDDEN_COLOR = "#d1d5db";
export const UNLABELED_COLOR = "#9ca3af";
export const LABELED_BORDER_COLOR = "#111827";

export const COMPOSITE_DOMAIN: [number, number] = [0, 1];
export const SAMPLE_SCORE_UPPER_EPS = 1e-9;
export const DISPLAY_MAX_POINTS = 25000;

export const FPV_METHOD_FETCH_FALLBACK: ProjectionMethod = "pca";
export const ALL_PROJECTION_METHODS: ProjectionMethod[] = ["tsne", "umap", "pca", "isomap"];

// ── Geometry helpers ──────────────────────────────────────────────────────────

export function projectionHasValidCoords(proj: FPVProjection2D | undefined): boolean {
  if (!proj || proj.x.length === 0 || proj.y.length !== proj.x.length) return false;
  return proj.x.some(
    (x, i) =>
      x != null &&
      proj.y[i] != null &&
      Number.isFinite(x) &&
      Number.isFinite(proj.y[i] as number),
  );
}

export function buildCoordsMap(
  points: FPVPointMetadata[],
  proj: FPVProjection2D,
): Record<number, [number, number]> | null {
  if (!projectionHasValidCoords(proj) || proj.x.length !== points.length) return null;
  const map: Record<number, [number, number]> = {};
  for (let i = 0; i < points.length; i++) {
    const x = proj.x[i];
    const y = proj.y[i];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    map[points[i].snippet_id] = [x, y];
  }
  return map;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

export function isProjectionNotReadyMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("generate projections first") ||
    lower.includes("no dataset-level feature projection rows found")
  );
}

export function extractFpvErrorDetail(error: unknown): string {
  const e = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) =>
        typeof d === "object" && d && "msg" in d
          ? String((d as { msg: string }).msg)
          : String(d),
      )
      .join("; ");
  }
  return String(e?.message ?? "Failed to load projection.");
}
