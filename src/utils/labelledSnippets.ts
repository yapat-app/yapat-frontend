import type { ExploreFilters } from "../types/explore";

/** No filtering at all: the rows call then returns every id that is asked for. */
export const NO_FILTERS: ExploreFilters = {
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
  similar_to: null,
};

/**
 * The snippets that carry at least one label. This is the same rule as the
 * sidebar's "Labeled" status, because both read the labels the feed rows carry.
 */
export function labelledIds(
  rows: ReadonlyArray<{ snippet_id: number; labels?: string[] | null }>,
): Set<number> {
  const out = new Set<number>();
  for (const row of rows) {
    if (row.labels && row.labels.length > 0) out.add(row.snippet_id);
  }
  return out;
}

/** "N of M": how many of the given snippets are labelled. */
export function countLabelled(
  ids: ReadonlyArray<number>,
  labelled: ReadonlySet<number>,
): number {
  let n = 0;
  for (const id of ids) if (labelled.has(id)) n += 1;
  return n;
}
