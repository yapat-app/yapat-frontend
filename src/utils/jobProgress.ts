import type { EmbeddingJobProgress, ScanProgress } from "../types";

/**
 * What a running job should show, computed in ONE place so the dataset list
 * and the progress panels can never disagree.
 *
 * `counting` is false while a job has no real count yet (embedding step 1,
 * "cutting recordings into snippets"; scan steps before "reading"): the
 * panels show an animated bar and no number then, and so does the list.
 * `shownPercent` is the whole number both display (rounded down, so neither
 * ever shows a value the other has not reached).
 */
export type JobProgressView = {
  counting: boolean;
  /** Exact percent, for bar widths. */
  percent: number;
  /** Whole percent, for text. */
  shownPercent: number;
};

export function embeddingProgressView(
  p: EmbeddingJobProgress | null,
): JobProgressView {
  const counting =
    p != null &&
    p.total != null &&
    (p.stage === "embedding" || p.stage === "completed");
  const percent = p?.status === "completed" ? 100 : (p?.percent ?? 0);
  return { counting, percent, shownPercent: Math.floor(percent) };
}

export function scanProgressView(p: ScanProgress | null): JobProgressView {
  const counting =
    p != null &&
    p.total != null &&
    (p.stage === "reading" || p.stage === "saving");
  const percent = p?.percent ?? 0;
  return { counting, percent, shownPercent: Math.floor(percent) };
}
