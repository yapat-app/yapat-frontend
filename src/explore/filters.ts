/**
 * Canonical explore filter spec built from the Annotation Hub's filter state.
 *
 * The feed, the sidebar histograms and the projection all call this with the
 * same inputs, so they send byte-identical filter specs (shared requests,
 * shared server caches) and can never disagree about "what passes".
 */

import type { ALFilterState } from "../types/al";
import type { SortField } from "../types/sort";
import {
  EXPLORE_SCORE_KEYS,
  type ExploreFilters,
  type ExploreScoreKey,
  type ExploreSortField,
  type ExploreSortFieldName,
} from "../types/explore";

export interface HubFilterInput {
  annotationStatus: "any" | "annotated" | "unannotated";
  annotatedSpecies: string[];
  predictedSpecies: string[];
  labelScope: string[];
  locations: string[];
  dateRange: [number, number] | null;
  months: number[];
  timeRange: [number, number] | null;
  alFilters: ALFilterState;
  /** Snippets that stay admitted by the status filter (just labelled). */
  stickyIds?: number[];
}

const sortedUnique = <T extends string | number>(values: T[]): T[] =>
  [...new Set(values)].sort((a, b) =>
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b)),
  );

export function buildExploreFilters(input: HubFilterInput): ExploreFilters {
  const visibility = input.alFilters.visibility;
  const scoreRanges: ExploreFilters["score_ranges"] = {};
  for (const key of visibility.propertyKeys ?? []) {
    if (!EXPLORE_SCORE_KEYS.includes(key as ExploreScoreKey)) continue;
    const range = visibility.ranges?.[key] ?? [0, 1];
    scoreRanges[key as ExploreScoreKey] = [range[0], range[1]];
  }
  const orderedRanges: ExploreFilters["score_ranges"] = {};
  for (const key of Object.keys(scoreRanges).sort() as ExploreScoreKey[]) {
    orderedRanges[key] = scoreRanges[key];
  }
  return {
    annotation_status: input.annotationStatus,
    annotated_species: sortedUnique(input.annotatedSpecies),
    predicted_species: sortedUnique(input.predictedSpecies),
    label_scope: sortedUnique(input.labelScope),
    locations: sortedUnique(input.locations),
    date_range: input.dateRange ? [input.dateRange[0], input.dateRange[1]] : null,
    months: sortedUnique(input.months),
    time_range: input.timeRange ? [input.timeRange[0], input.timeRange[1]] : null,
    score_ranges: orderedRanges,
    // Only meaningful when a status filter is active; omitting it otherwise
    // keeps request keys (and server caches) stable while labelling.
    sticky_ids:
      input.annotationStatus === "any"
        ? []
        : sortedUnique(input.stickyIds ?? []).slice(0, 5000),
  };
}

/** Filter spec with sticky ids removed — identifies the "question" asked. */
export function filterViewKey(filters: ExploreFilters): string {
  return JSON.stringify({ ...filters, sticky_ids: [] });
}

const SORTABLE: ExploreSortFieldName[] = [
  "confidence",
  "composite",
  "uncertainty",
  "diversity",
  "density",
  "date",
  "time",
];

export function buildExploreSort(fields: SortField[] | undefined): ExploreSortField[] {
  return (fields ?? [])
    .filter((f) => !f.disabled)
    .filter((f) => SORTABLE.includes(f.property as ExploreSortFieldName))
    .map((f) => ({
      field: f.property as ExploreSortFieldName,
      direction: f.direction,
    }));
}
