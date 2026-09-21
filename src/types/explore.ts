/**
 * Server-side explore API (/api/explore) — see
 * yapat-backend/docs/superpowers/plans/2026-09-16-server-side-explore.md.
 */

import type { PAMPrediction } from "./al";

export type ExploreScoreKey =
  | "uncertainty"
  | "diversity"
  | "density"
  | "composite"
  | "confidence";

export const EXPLORE_SCORE_KEYS: ExploreScoreKey[] = [
  "uncertainty",
  "diversity",
  "density",
  "composite",
  "confidence",
];

export type ExploreSortFieldName =
  | "confidence"
  | "composite"
  | "uncertainty"
  | "diversity"
  | "density"
  | "date"
  | "time";

export type ExploreProjectionMethod = "pca" | "umap" | "tsne" | "isomap";

export interface ExploreScope {
  dataset_id: number;
  snippet_set_id: number;
  checkpoint_id: number | null;
  embedding_model_id: number | null;
}

export interface ExploreFilters {
  annotation_status: "any" | "annotated" | "unannotated";
  annotated_species: string[];
  predicted_species: string[];
  label_scope: string[];
  locations: string[];
  date_range: [number, number] | null;
  months: number[];
  time_range: [number, number] | null;
  /** Normalised [0,1] fractions of each score's domain. */
  score_ranges: Partial<Record<ExploreScoreKey, [number, number]>>;
  sticky_ids: number[];
}

export interface ExploreSortField {
  field: ExploreSortFieldName;
  direction: "asc" | "desc";
}

export interface ExploreVersions {
  base: string;
  model: string | null;
  labels: string;
  projection?: string;
}

export interface ExploreSummary {
  status: "ready";
  versions: ExploreVersions;
  has_model: boolean;
  counts: {
    total_snippets: number;
    population: number;
    non_score: number;
    visible: number;
    labeled: number;
  };
  domains: Partial<Record<ExploreScoreKey, [number, number]>>;
  bins: number;
  histograms: Record<ExploreScoreKey, { total: number[]; visible: number[] }>;
}

export interface ExploreFacets {
  status: "ready";
  versions: ExploreVersions;
  locations: string[];
  annotated_species: string[];
  label_order: string[];
  has_date_time: boolean;
  date_domain: [number, number] | null;
  /** [epochDay, recordingCount] pairs. */
  date_counts: [number, number][];
  /** [minuteOfDay, recordingCount] pairs. */
  time_counts: [number, number][];
}

export interface ExploreFeedRow extends PAMPrediction {
  /** Ground-truth / user labels on this snippet (sorted). */
  labels: string[];
}

export interface ExploreFeedPage {
  status: "ready";
  versions: ExploreVersions;
  total: number;
  offset: number;
  limit: number;
  anchor_index: number | null;
  anchor_snippet_id: number | null;
  rows: ExploreFeedRow[];
}

export interface ExploreRowsResponse {
  status: "ready";
  versions: ExploreVersions;
  rows: ExploreFeedRow[];
  visible: boolean[];
}

/** Decoded static projection points for one method. */
export interface ExploreProjectionPoints {
  versions: ExploreVersions;
  method: ExploreProjectionMethod;
  available: boolean;
  reason: string | null;
  totalPoints: number;
  sampled: boolean;
  pointCount: number;
  bounds: [number, number, number, number] | null;
  ids: Int32Array;
  x: Float32Array;
  y: Float32Array;
}

export interface ExplorePointSet {
  count: number;
  ids: Int32Array;
  x: Float32Array;
  y: Float32Array;
  /** Little-endian packed visibility bits. */
  visible: Uint8Array;
  /** Index into labelVocab, -1 when unlabeled. */
  labelIdx: Int16Array | Int32Array;
}

export interface ExploreDensity {
  nx: number;
  ny: number;
  bounds: [number, number, number, number];
  total: Uint32Array;
  visible: Uint32Array;
}

/** Decoded filter-dependent projection state (aligned with the static points). */
export interface ExploreProjectionState {
  versions: ExploreVersions;
  method: ExploreProjectionMethod;
  totalPoints: number;
  visiblePoints: number;
  pointCount: number;
  visible: Uint8Array;
  labelIdx: Int16Array | Int32Array;
  labelVocab: string[];
  extras: ExplorePointSet;
  density: ExploreDensity | null;
}

export interface ExploreViewport extends ExplorePointSet {
  versions: ExploreVersions;
  method: ExploreProjectionMethod;
  bbox: [number, number, number, number];
  complete: boolean;
  labelVocab: string[];
}

export function bitAt(bits: Uint8Array, index: number): boolean {
  return ((bits[index >> 3] >> (index & 7)) & 1) === 1;
}
