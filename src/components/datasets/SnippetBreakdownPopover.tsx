/**
 * Hover on the dataset card's snippet tiles: the card's totals add up every
 * model's snippets, so each tile splits its own number by model. Total snippets
 * shows where the snippets come from, Annotated snippets their label status.
 *
 * The trigger is a div[role=button], not <button>: a global `button { all: unset }`
 * rule from a dependency strips <button> styling.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Popover } from "antd";
import type { EmbeddingOption } from "../../types";
import type {
  SnippetBreakdown,
  SnippetSetBreakdown,
} from "../../types/labelSharing";
import {
  groupEmbeddingOptions,
  dedupeEmbeddingOptions,
  pickEmbeddingOption,
} from "../../utils/embeddingOptions";

export type SnippetBreakdownView = "snippets" | "annotated";

type Props = {
  view: SnippetBreakdownView;
  breakdown: SnippetBreakdown | null;
  failed: boolean;
  onOpen: () => void;
  options: EmbeddingOption[];
  recordingCount: number;
  /** Phase offers shared labels: split out copies and suggestions. */
  showSharing: boolean;
  /** Opens the shared-label review for the model Annotate uses. */
  reviewHref: string;
  ariaLabel: string;
  children: ReactNode;
};

type TableProps = Omit<Props, "onOpen" | "ariaLabel" | "children">;

type Row = {
  key: number;
  name: string;
  /** Why the row is not a normal finished model; null when it is. */
  note: string | null;
  windowSize: number | null;
  recordings: number;
  partial: boolean;
  annotating: boolean;
  total: number;
  labelled: number;
  autoCopied: number;
  toReview: number;
};

const fmtCount = new Intl.NumberFormat();
const count = (value: number) => (value > 0 ? fmtCount.format(value) : "–");
const annotatedOf = (annotated: number, total: number) =>
  total > 0 ? `${fmtCount.format(annotated)} / ${fmtCount.format(total)}` : "–";
const percent = (part: number, total: number) =>
  part > 0 && total > 0 ? Math.max((part / total) * 100, 1.5) : 0;

function buildRows(
  sets: SnippetSetBreakdown[],
  options: EmbeddingOption[],
  recordingCount: number,
  showSharing: boolean,
): Row[] {
  const bySet = new Map(sets.map((set) => [set.snippet_set_id, set]));
  const annotating = pickEmbeddingOption(dedupeEmbeddingOptions(options), null);
  const shown = new Set<number>();

  const makeRow = (
    key: number,
    name: string,
    windowSize: number | null,
    set: SnippetSetBreakdown | undefined,
    state: "ready" | "generating" | "unused",
    isAnnotating: boolean,
  ): Row => {
    const recordings = set?.recording_count ?? 0;
    return {
      key,
      name,
      note:
        state === "generating"
          ? "Generating embeddings…"
          : state === "unused"
            ? "No finished model uses these"
            : null,
      windowSize,
      recordings,
      partial:
        state === "ready" && recordings > 0 && recordings < recordingCount,
      annotating: isAnnotating,
      total: set?.total_snippets ?? 0,
      labelled:
        (set?.labelled ?? 0) + (showSharing ? 0 : (set?.auto_copied ?? 0)),
      autoCopied: showSharing ? (set?.auto_copied ?? 0) : 0,
      toReview: showSharing ? (set?.to_review ?? 0) : 0,
    };
  };

  const rows: Row[] = [];
  for (const group of groupEmbeddingOptions(options)) {
    const models = group.options.filter((o) => o.status !== "failed");
    if (models.length === 0) continue;
    shown.add(group.snippetSetId);
    rows.push(
      makeRow(
        group.snippetSetId,
        models.map((o) => `${o.name} ${o.version}`).join(", "),
        models[0].window_size,
        bySet.get(group.snippetSetId),
        models.some((o) => o.status === "completed") ? "ready" : "generating",
        models.some(
          (o) => o.embedding_model_id === annotating?.embedding_model_id,
        ),
      ),
    );
  }
  // The card's total counts every snippet, also those of a failed model's set.
  for (const set of sets) {
    if (!shown.has(set.snippet_set_id) && set.total_snippets > 0) {
      rows.push(
        makeRow(
          set.snippet_set_id,
          `${set.window_size} s snippets`,
          set.window_size,
          set,
          "unused",
          false,
        ),
      );
    }
  }
  return rows;
}

const HEAD_CELL =
  "whitespace-nowrap pb-1.5 pl-3 text-right text-fs-11 font-normal";
const NUMBER_CELL = "whitespace-nowrap py-2 pl-3 text-right tabular-nums";
const TOTAL_CELL = "whitespace-nowrap pt-2 pl-3 text-right tabular-nums";

const ModelCell = ({
  row,
  showProgress,
}: {
  row: Row;
  showProgress: boolean;
}) => (
  <td className="py-2">
    <div className="flex items-center gap-1.5">
      <span className="font-ibm-mono text-xs font-semibold text-slate-900">
        {row.name}
      </span>
      {row.annotating && (
        <span className="rounded bg-indigo-50 px-1.5 text-[10px] font-medium leading-4 text-indigo-800">
          Annotating
        </span>
      )}
    </div>
    {row.note && (
      <div className="text-fs-11 leading-4 text-slate-600">{row.note}</div>
    )}
    {showProgress && (
      <div
        className="mt-1 flex h-0.75 w-30 gap-px overflow-hidden rounded-full bg-slate-200"
        aria-hidden="true"
      >
        <span
          className="bg-emerald-600"
          style={{ width: `${percent(row.labelled, row.total)}%` }}
        />
        <span
          className="bg-emerald-300"
          style={{ width: `${percent(row.autoCopied, row.total)}%` }}
        />
      </div>
    )}
  </td>
);

const ReviewCount = ({ row, href }: { row: Row; href: string }) => {
  if (row.toReview <= 0) return <span className="text-slate-500">–</span>;
  // The review opens on the model Annotate uses, so only that row can link.
  return row.annotating ? (
    <Link
      to={href}
      className="font-semibold text-amber-800! underline-offset-2 hover:text-amber-900! hover:underline"
    >
      {fmtCount.format(row.toReview)}
    </Link>
  ) : (
    <span className="font-semibold text-amber-800">
      {fmtCount.format(row.toReview)}
    </span>
  );
};

const LoadingRows = ({ columns }: { columns: number }) => (
  <>
    {[0, 1].map((row) => (
      <tr key={row} className="border-b border-slate-100">
        <td className="py-2.5">
          <div className="h-3 w-28 rounded bg-slate-200" />
        </td>
        {Array.from({ length: columns - 1 }, (_, cell) => (
          <td key={cell} className="py-2.5 pl-3">
            <div className="ml-auto h-3 w-8 rounded bg-slate-100" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const SnippetsTable = ({
  rows,
  loading,
  recordingCount,
}: {
  rows: Row[];
  loading: boolean;
  recordingCount: number;
}) => (
  <table className="w-full min-w-110 border-collapse text-[13px] text-slate-800">
    <thead>
      <tr className="border-b border-slate-200 text-slate-600">
        <th className="pb-1.5 text-left text-fs-11 font-normal">Model</th>
        <th className={HEAD_CELL}>Snippet length</th>
        <th className={HEAD_CELL}>Recordings</th>
        <th className={HEAD_CELL}>Snippets</th>
      </tr>
    </thead>
    <tbody>
      {loading && <LoadingRows columns={4} />}
      {rows.map((row) => (
        <tr key={row.key} className="border-b border-slate-100">
          <ModelCell row={row} showProgress={false} />
          <td className={NUMBER_CELL}>
            {row.windowSize === null ? "–" : `${row.windowSize} s`}
          </td>
          <td
            className={`${NUMBER_CELL} ${row.partial ? "text-amber-800" : ""}`}
          >
            {row.partial
              ? `${fmtCount.format(row.recordings)} of ${fmtCount.format(recordingCount)}`
              : count(row.recordings)}
          </td>
          <td className={`${NUMBER_CELL} font-medium`}>{count(row.total)}</td>
        </tr>
      ))}
    </tbody>
    {rows.length > 1 && (
      <tfoot>
        <tr className="font-semibold">
          <td className="pt-2" colSpan={3}>
            All models
          </td>
          <td className={TOTAL_CELL}>
            {count(rows.reduce((sum, row) => sum + row.total, 0))}
          </td>
        </tr>
      </tfoot>
    )}
  </table>
);

const AnnotatedTable = ({
  rows,
  loading,
  showSharing,
  reviewHref,
}: {
  rows: Row[];
  loading: boolean;
  showSharing: boolean;
  reviewHref: string;
}) => {
  const sum = (pick: (row: Row) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  return (
    <table
      className={`w-full border-collapse text-[13px] text-slate-800 ${showSharing ? "min-w-130" : "min-w-80"}`}
    >
      <thead>
        <tr className="border-b border-slate-200 text-slate-600">
          <th className="pb-1.5 text-left text-fs-11 font-normal">Model</th>
          <th className={HEAD_CELL}>Annotated</th>
          {showSharing && (
            <>
              <th className={HEAD_CELL}>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-xs bg-emerald-600" />
                  Labelled
                </span>
              </th>
              <th className={HEAD_CELL}>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-xs border border-dashed border-emerald-600" />
                  Auto-copied
                </span>
              </th>
              <th className={HEAD_CELL}>To review</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {loading && <LoadingRows columns={showSharing ? 5 : 2} />}
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-slate-100">
            <ModelCell row={row} showProgress />
            <td className={`${NUMBER_CELL} font-medium`}>
              {annotatedOf(row.labelled + row.autoCopied, row.total)}
            </td>
            {showSharing && (
              <>
                <td className={`${NUMBER_CELL} font-semibold text-emerald-700`}>
                  {count(row.labelled)}
                </td>
                <td className={NUMBER_CELL}>{count(row.autoCopied)}</td>
                <td className={NUMBER_CELL}>
                  <ReviewCount row={row} href={reviewHref} />
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr className="font-semibold">
            <td className="pt-2">All models</td>
            <td className={TOTAL_CELL}>
              {annotatedOf(
                sum((row) => row.labelled + row.autoCopied),
                sum((row) => row.total),
              )}
            </td>
            {showSharing && (
              <>
                <td className={`${TOTAL_CELL} text-emerald-700`}>
                  {count(sum((row) => row.labelled))}
                </td>
                <td className={TOTAL_CELL}>
                  {count(sum((row) => row.autoCopied))}
                </td>
                <td className={`${TOTAL_CELL} text-amber-800`}>
                  {count(sum((row) => row.toReview))}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      )}
    </table>
  );
};

const BreakdownContent = ({
  view,
  breakdown,
  failed,
  options,
  recordingCount,
  showSharing,
  reviewHref,
}: TableProps) => {
  const rows = breakdown
    ? buildRows(breakdown.snippet_sets, options, recordingCount, showSharing)
    : [];
  const isSnippets = view === "snippets";

  const notes = isSnippets
    ? [
        rows.length > 1
          ? "Embedding models with different snippet lengths cut the same audio separately, so the total counts it more than once."
          : "These models share the same snippets and labels.",
        rows.some((row) => row.partial)
          ? "Recordings shorter than a model's snippet length usually have no snippets for it."
          : null,
      ]
    : [
        showSharing
          ? "Suggestions to review are optional and don't count as annotated."
          : null,
      ];
  const note = breakdown
    ? notes.filter(Boolean).join(" ")
    : "Counting snippets for each model…";

  return (
    <div
      className={`max-w-[calc(100vw-48px)] font-ibm-sans ${isSnippets ? "w-125" : showSharing ? "w-145" : "w-95"}`}
    >
      <span className="text-[13px] font-semibold text-slate-900">
        {isSnippets ? "Snippets by model" : "Annotated snippets by model"}
      </span>

      {failed && !breakdown ? (
        <p className="m-0 mt-3 text-xs text-slate-600">
          Could not load the breakdown. Hover again to retry.
        </p>
      ) : (
        <>
          <div className="mt-2.5 overflow-x-auto">
            {isSnippets ? (
              <SnippetsTable
                rows={rows}
                loading={!breakdown}
                recordingCount={recordingCount}
              />
            ) : (
              <AnnotatedTable
                rows={rows}
                loading={!breakdown}
                showSharing={showSharing}
                reviewHref={reviewHref}
              />
            )}
          </div>
          {note && (
            <p className="m-0 mt-2.5 border-t border-slate-100 pt-2 text-fs-11 leading-4 text-slate-600">
              {note}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export const SnippetBreakdownPopover = ({
  onOpen,
  ariaLabel,
  children,
  ...content
}: Props) => (
  <Popover
    content={<BreakdownContent {...content} />}
    trigger={["hover", "focus"]}
    placement="bottom"
    mouseEnterDelay={0.12}
    onOpenChange={(open) => {
      if (open) onOpen();
    }}
  >
    <div
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      className="h-full cursor-default rounded-lg transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      {children}
    </div>
  </Popover>
);
