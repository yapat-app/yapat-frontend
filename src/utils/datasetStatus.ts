import type { Dataset } from "../types";

/**
 * Embedding / scan state of a dataset, derived in the same order the
 * GenerateEmbeddings control walks its states, so the list, the detail badge
 * and the action control can never disagree.
 */
export type DatasetStatus =
  | "scanning"
  | "scan_failed"
  | "processing"
  | "generating"
  | "ready"
  | "not_found";

export type DatasetStatusMeta = {
  label: string;
  /** Tooltip text; mirrors the titles the old disabled buttons carried. */
  hint?: string;
  /** Tailwind classes for the list / legend dot. */
  dot: string;
  /** Tailwind classes for the detail pill: a light tint of the dot colour. */
  badge: string;
  /** Tailwind background for the in-progress bar in the list. */
  bar: string;
};

export const DATASET_STATUS_META: Record<DatasetStatus, DatasetStatusMeta> = {
  ready: {
    label: "Embeddings ready",
    dot: "bg-emerald-600",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    bar: "bg-emerald-600",
  },
  generating: {
    label: "Generating embeddings…",
    dot: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    bar: "bg-orange-500",
  },
  scanning: {
    label: "Scanning files…",
    hint: "Waiting for the scan to finish",
    dot: "bg-blue-500 animate-pulse",
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    bar: "bg-blue-500",
  },
  processing: {
    label: "Processing dataset…",
    hint: "Waiting for dataset scan/discovery to finish (recordings not available yet)",
    dot: "bg-slate-400",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    bar: "bg-slate-400",
  },
  scan_failed: {
    label: "Scan failed",
    hint: "The scan failed; see the message below",
    dot: "bg-red-600",
    badge: "border-red-200 bg-red-50 text-red-700",
    bar: "bg-red-600",
  },
  not_found: {
    label: "Embeddings not found",
    dot: "border-2 border-red-600 bg-transparent",
    badge: "border-red-200 bg-red-50 text-red-700",
    bar: "bg-red-600",
  },
};

/** Shape of what the jobs provider knows about a dataset's running work. */
export type DatasetJobFlags = {
  /** An embedding job is in flight. */
  running: boolean;
  /** A scan is queued or running. */
  scanning: boolean;
  /** The latest scan failed. */
  scanFailed: boolean;
};

export function getDatasetStatus(
  dataset: Dataset,
  jobs: DatasetJobFlags,
): DatasetStatus {
  const hasRecordings = (dataset.recording_count ?? 0) > 0;
  if (jobs.scanning) return "scanning";
  if (jobs.scanFailed && !hasRecordings) return "scan_failed";
  if (!hasRecordings) return "processing";
  if (jobs.running) return "generating";
  if (dataset.is_ready_for_feed) return "ready";
  return "not_found";
}

/**
 * Annotation progress label: whole percent from 1%, two decimals below that
 * (so 22 of 24,360 reads "0.09%"), and "0%" when nothing is annotated.
 */
export function formatPercent(annotated: number, total: number): string {
  if (!total || annotated <= 0) return "0%";
  const pct = (annotated / total) * 100;
  if (pct >= 1) return `${Math.round(pct)}%`;
  return `${pct.toFixed(2)}%`;
}

/** "3 datasets" when nothing is filtered, "2 of 8" when a filter is on. */
export function formatDatasetCount(visible: number, total: number): string {
  if (visible === total) return `${total} dataset${total === 1 ? "" : "s"}`;
  return `${visible} of ${total}`;
}

/** Order the states appear in the legend. */
export const DATASET_STATUS_ORDER: DatasetStatus[] = [
  "ready",
  "generating",
  "not_found",
  "scanning",
  "processing",
  "scan_failed",
];

/** Short names used by the legend. */
export const LEGEND_LABEL: Record<DatasetStatus, string> = {
  ready: "Embeddings ready",
  generating: "Generating",
  not_found: "Not found",
  scanning: "Scanning",
  processing: "Processing",
  scan_failed: "Scan failed",
};
