/**
 * DatasetList — the left panel of the Datasets page: a scrollable list of
 * datasets, each with a status dot and annotation progress, and a legend that
 * explains what the dot colours mean.
 *
 * Presentational only. Filtering, sorting and selection live in the page; this
 * renders what it is given. Clickable surfaces are div[role=...] (not
 * <button>) because a global `button { all: unset }` rule from a dependency
 * would strip a button's styling.
 */

import { useEffect, useRef } from "react";
import { SearchOutlined } from "@ant-design/icons";
import type { Dataset } from "../../types";
import { useDatasetJobs, useDatasetStatusLookup } from "./datasetJobsContext";
import { embeddingProgressView, scanProgressView } from "../../utils/jobProgress";
import {
  DATASET_STATUS_META,
  DATASET_STATUS_ORDER,
  LEGEND_LABEL,
  formatDatasetCount,
  formatPercent,
  type DatasetStatus,
} from "../../utils/datasetStatus";

export type DatasetStat = { total: number; annotated: number };

type Props = {
  /** Datasets after filtering and sorting. */
  datasets: Dataset[];
  totalCount: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Used for ArrowUp/ArrowDown so a surface like the drawer can stay open
   *  while the selection moves. Falls back to `onSelect`. */
  onStep?: (id: number) => void;
  statsById: Map<number, DatasetStat>;
  /** Annotators get a search box here; admins and owners use the page toolbar. */
  showSearch: boolean;
  search: string;
  onSearch: (value: string) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
};

/** Small "Clear filters" control, sized for the surface it sits on. */
export const ClearFiltersLink = ({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) => (
  <div
    role="button"
    tabIndex={0}
    aria-label="Clear filters"
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    }}
    className={`cursor-pointer whitespace-nowrap text-xs text-slate-500 transition-colors hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 ${className}`}
  >
    Clear filters
  </div>
);

const DatasetListItem = ({
  dataset,
  selected,
  onSelect,
  status,
  stat,
}: {
  dataset: Dataset;
  selected: boolean;
  onSelect: () => void;
  status: DatasetStatus;
  stat: DatasetStat | undefined;
}) => {
  // Same rule the old card used per dataset: placeholder until its stats arrive.
  const statsReady = stat != null;
  const isReference = !!dataset.is_reference;
  const typeLabel = (dataset.dataset_type ?? "PAM").replaceAll("_", " ");
  const total = stat?.total ?? 0;
  const annotated = stat?.annotated ?? 0;
  const pct = total > 0 ? Math.min(100, (annotated / total) * 100) : 0;
  const meta = DATASET_STATUS_META[status];

  // Scanning / generating: show the live job progress (already polled by the
  // jobs provider) in that state's colour instead of the annotation bar. It is
  // computed by the same helper the detail panels use, so the two always show
  // the same number, and "no count yet" (step 1) looks the same in both.
  const jobs = useDatasetJobs(dataset);
  const inProgress = status === "generating" || status === "scanning";
  const jobView =
    status === "generating"
      ? embeddingProgressView(jobs.embeddingProgress)
      : status === "scanning"
        ? scanProgressView(jobs.scanProgress)
        : null;
  const jobLabel = status === "generating" ? "Generating" : "Scanning";

  return (
    <div
      role="option"
      aria-selected={selected}
      data-dataset-id={dataset.id}
      tabIndex={selected ? 0 : -1}
      onClick={(e) => {
        // Some browsers do not focus a clicked div, which would leave the arrow
        // keys with nothing to act on.
        e.currentTarget.focus({ preventScroll: true });
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`shrink-0 cursor-pointer rounded-lg border px-3.5 py-3 transition-colors outline-none ${
        selected
          ? "border-blue-500 bg-blue-50/50"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-bold font-ibm-mono text-slate-900">
            {dataset.name}
          </span>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-fs-10 font-medium text-slate-600">
            {typeLabel}
          </span>
          {isReference && (
            <span className="shrink-0 rounded bg-purple-50 px-1.5 py-0.5 text-fs-10 font-medium text-purple-700">
              Reference
            </span>
          )}
        </div>
        <span
          role="img"
          aria-label={meta.label}
          title={meta.label}
          className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`}
        />
      </div>
      <p className="m-0 mt-0.5 truncate text-xs text-slate-500 font-ibm-sans">
        {dataset.description?.trim() ? dataset.description : "—"}
      </p>

      {inProgress ? (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200"
            aria-hidden="true"
          >
            {/* No count yet (step 1): the track stays empty and grey. The
                colour fills in only as real progress arrives. */}
            {jobView?.counting && (
              <div
                className={`h-full rounded-full ${meta.bar}`}
                style={{ width: `${Math.max(jobView.percent, 1.5)}%` }}
              />
            )}
          </div>
          <span className="shrink-0 text-right text-xs font-medium text-slate-700">
            {jobView?.counting
              ? `${jobLabel} ${jobView.shownPercent}%`
              : `${jobLabel}…`}
          </span>
        </div>
      ) : (
        !isReference && (
          <div className="mt-2.5 flex items-center gap-2.5">
            {statsReady ? (
              <>
                <div
                  className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${pct > 0 ? Math.max(pct, 1.5) : 0}%` }}
                  />
                </div>
                <span
                  className="shrink-0 text-right text-xs font-semibold text-slate-700"
                  title={`Annotated: ${annotated.toLocaleString()} of ${total.toLocaleString()} snippets`}
                >
                  {formatPercent(annotated, total)}
                  <span className="ml-1 font-normal text-slate-400">annotated</span>
                </span>
              </>
            ) : (
              <span className="inline-block h-3 w-full rounded bg-gray-200" />
            )}
          </div>
        )
      )}
    </div>
  );
};

export const DatasetList = ({
  datasets,
  totalCount,
  selectedId,
  onSelect,
  onStep,
  statsById,
  showSearch,
  search,
  onSearch,
  filtersActive,
  onClearFilters,
}: Props) => {
  const statusOf = useDatasetStatusLookup();

  // Keep the selected item on screen when the selection changes from outside
  // the list (a filter or sort picks a new first item).
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId == null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-dataset-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, datasets]);

  // Id of the dataset `dir` steps away from the selected one (clamped), or the
  // first one when nothing is selected.
  const neighbourId = (dir: 1 | -1) => {
    const current = datasets.findIndex((d) => Number(d.id) === selectedId);
    const next =
      current < 0
        ? 0
        : Math.min(Math.max(current + dir, 0), datasets.length - 1);
    return Number(datasets[next].id);
  };

  // ArrowUp / ArrowDown (and Home / End) move the selection through the list,
  // like a native select. The new item takes focus and scrolls into view so the
  // next key press continues from it.
  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (datasets.length === 0) return;
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const id =
      e.key === "Home"
        ? Number(datasets[0].id)
        : e.key === "End"
          ? Number(datasets[datasets.length - 1].id)
          : neighbourId(e.key === "ArrowDown" ? 1 : -1);
    // React clears currentTarget once the handler returns, so keep the list.
    const list = e.currentTarget;
    (onStep ?? onSelect)(id);
    requestAnimationFrame(() => {
      const el = list.querySelector<HTMLElement>(`[data-dataset-id="${id}"]`);
      el?.focus();
      el?.scrollIntoView({ block: "nearest" });
    });
  };

  // In the search box the arrows pick cards while the caret stays in the field,
  // so you can keep refining the search.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (datasets.length === 0) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    (onStep ?? onSelect)(neighbourId(e.key === "ArrowDown" ? 1 : -1));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <h2 className="m-0 text-base font-bold font-ibm-mono text-slate-900">
          Available Datasets
        </h2>
        <div className="flex items-center gap-2.5">
          {/* Annotators have no toolbar, so the reset lives here for them. */}
          {showSearch && filtersActive && (
            <ClearFiltersLink onClick={onClearFilters} />
          )}
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {formatDatasetCount(datasets.length, totalCount)}
          </span>
        </div>
      </div>

      {showSearch && (
        <div className="px-3 pb-3">
          <div className="relative">
            <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search datasets"
              aria-label="Search datasets"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>
      )}

      <div
        ref={listRef}
        role="listbox"
        aria-label="Available datasets"
        tabIndex={-1}
        onKeyDown={handleListKeyDown}
        onMouseDown={(e) => {
          // A click on the list's own padding / gaps keeps the arrows working.
          if (e.target === e.currentTarget) e.currentTarget.focus();
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-scroll outline-none border-t border-slate-100 p-3 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {datasets.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="m-0 text-sm font-medium text-slate-700">
              No datasets match your filters
            </p>
            <p className="m-0 mt-1 text-xs text-slate-500">
              {totalCount} dataset{totalCount === 1 ? "" : "s"} available. Try a
              broader search or a different team.
            </p>
            {filtersActive && (
              <ClearFiltersLink onClick={onClearFilters} className="mt-3" />
            )}
          </div>
        ) : (
          datasets.map((d) => (
            <DatasetListItem
              key={d.id}
              dataset={d}
              selected={Number(d.id) === selectedId}
              onSelect={() => onSelect(Number(d.id))}
              status={statusOf(d)}
              stat={statsById.get(Number(d.id))}
            />
          ))
        )}
      </div>

      {/* What the dot colours mean. Always shown so the symbols are never a guess. */}
      <div
        aria-label="Status legend"
        className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500"
      >
        {DATASET_STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${DATASET_STATUS_META[s].dot}`}
            />
            {LEGEND_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
};
