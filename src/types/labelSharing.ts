/**
 * Label sharing between the snippet sets of a dataset (issue #93, part 2).
 * Mirrors yapat-backend app/schemas/label_share.py.
 *
 * A pending candidate is only a suggestion: until someone accepts it, the
 * target clip counts as unlabelled for training and the feed. Rejecting it
 * writes no label either.
 */

/**
 * `source_removed` is a recheck, not a suggestion: the label this snippet's
 * reviewed label came from was deleted. Keeping changes nothing; removing
 * deletes the label.
 */
export type LabelShareReason =
  | "partial_overlap"
  | "target_shorter"
  | "target_longer"
  | "conflict"
  | "source_removed";

export type LabelShareStatus =
  "pending" | "accepted" | "rejected" | "relabelled";

export interface LabelShareClip {
  snippet_id: number;
  snippet_set_id: number;
  recording_id: number;
  recording_file_name?: string | null;
  start_time: number;
  end_time: number;
}

export interface LabelShareCandidate {
  id: number;
  dataset_id: number;
  status: LabelShareStatus;
  reason: LabelShareReason;
  taxon_id: string;
  resolved_name_snapshot: string;
  /** The label text as the hub shows it. */
  label: string;
  overlap_seconds: number;
  /** Null for a recheck: the source label was deleted. */
  source_annotation_id: number | null;
  /** A recheck: the label to keep or remove. */
  target_annotation_id?: number | null;
  source_labeled_by?: string | null;
  source: LabelShareClip;
  target: LabelShareClip;
  /** Labels the target clip has now. */
  target_labels: string[];
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  result_annotation_id?: number | null;
  created_at: string;
}

export interface LabelShareCandidateList {
  items: LabelShareCandidate[];
  total: number;
  skip: number;
  limit: number;
}

export interface LabelShareSummary {
  dataset_id: number;
  auto_shared: number;
  pending: number;
  accepted: number;
  rejected: number;
  relabelled: number;
  /** snippet_set_id → pending count. JSON keys arrive as strings. */
  pending_by_snippet_set: Record<string, number>;
  /** snippet_set_id → reason → pending count. Missing on older backends. */
  pending_by_snippet_set_reason?: Record<
    string,
    Partial<Record<LabelShareReason, number>>
  >;
  /** snippet_set_id → clips with a label made by a person. Missing on older backends. */
  labelled_by_snippet_set?: Record<string, number>;
}

/** One snippet set by label status; each snippet counts once. */
export interface SnippetSetBreakdown {
  snippet_set_id: number;
  window_size: number;
  status: string;
  total_snippets: number;
  /** Recordings with at least one snippet in this set. */
  recording_count: number;
  /** Snippets with a label made or accepted by a person. */
  labelled: number;
  /** Snippets whose only labels are unreviewed automatic copies. */
  auto_copied: number;
  /** Pending suggestions, which may sit on labelled snippets too. */
  to_review: number;
}

export interface SnippetBreakdown {
  dataset_id: number;
  snippet_sets: SnippetSetBreakdown[];
}

export interface LabelShareReviewResult {
  candidate: LabelShareCandidate;
  annotation_id?: number | null;
}

export type LabelShareDecision = "accept" | "reject" | "relabel";

/** Annotation.origin values. */
export type AnnotationOrigin = "manual" | "auto_shared" | "reviewed_shared";
