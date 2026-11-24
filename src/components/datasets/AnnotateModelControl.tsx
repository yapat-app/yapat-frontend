/**
 * "Annotating with <model>" under a dataset card's title: the embedding model
 * the Annotation Hub uses for this dataset. Admins and team owners open it to
 * pick another finished model; everyone else sees it read-only.
 *
 * Clickable surfaces are div[role=button], not <button>: a global
 * `button { all: unset }` rule from a dependency strips <button> styling.
 */

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Popover, message } from "antd";
import { DownOutlined } from "@ant-design/icons";
import type {
  Dataset,
  EmbeddingOption,
  ReferencePoolState,
} from "../../types";
import {
  datasetApi,
  embeddingApi,
  getErrorMessage,
} from "../../services/api";
import {
  dedupeEmbeddingOptions,
  groupEmbeddingOptions,
} from "../../utils/embeddingOptions";

type Props = {
  dataset: Dataset;
  /** The dataset's embedding jobs (one row per job), as the card loaded them. */
  options: EmbeddingOption[];
  /** Admins and team owners on a dataset with several finished models. */
  canPick: boolean;
  /** Called after a change is saved, so the card reloads its options. */
  onSaved: () => void;
  /**
   * Pending shared-label suggestions per snippet set (label sharing). Null
   * hides every review hint: one model, an older backend, or a phase without
   * the review.
   */
  pendingBySnippetSet?: Record<string, number> | null;
  /** Opens Annotate with the shared-label review switched on. */
  reviewHref?: string;
  /** Admins can start the missing embedding jobs of reference pools. */
  isAdmin?: boolean;
  /** Reloads the options, e.g. while a reference pool is embedding. */
  onRefreshOptions?: () => void;
};

/** A pool in one of these states keeps the model from being chosen. */
const BLOCKING_POOL_STATES = new Set(["embedding", "failed", "not_embedded"]);
const blockingPools = (o: EmbeddingOption) =>
  (o.reference_pools ?? []).filter((p) => BLOCKING_POOL_STATES.has(p.state));

const POOL_STATE: Record<
  ReferencePoolState["state"],
  { label: (p: ReferencePoolState) => string; tone: string }
> = {
  ready: {
    label: (p) => `Ready · ${fmtCount.format(p.snippets)} snippets`,
    tone: "text-emerald-700",
  },
  no_snippets: {
    label: () => "Ready · no usable snippets",
    tone: "text-slate-600",
  },
  embedding: { label: () => "Embedding…", tone: "text-blue-700" },
  failed: { label: () => "Embedding failed", tone: "text-red-700" },
  not_embedded: { label: () => "Not embedded", tone: "text-amber-800" },
};

/** Reference pools for the model about to be chosen, with their state. */
const PoolTable = ({ option }: { option: EmbeddingOption }) => (
  <table className="w-full border-collapse text-xs">
    <thead>
      <tr className="border-b border-amber-200 text-left text-fs-11 text-slate-600">
        <th className="pb-1 font-normal">Reference pool</th>
        <th className="pb-1 pl-2 font-normal">Linked to</th>
        <th className="pb-1 pl-2 font-normal">{modelName(option)}</th>
      </tr>
    </thead>
    <tbody>
      {(option.reference_pools ?? []).map((p) => (
        <tr key={p.dataset_id} className="border-b border-amber-100 last:border-0">
          <td className="py-1 font-medium text-slate-900">{p.name}</td>
          <td className="py-1 pl-2 text-slate-600">
            {p.scope === "team" ? "Team" : "This dataset"}
          </td>
          <td className={`py-1 pl-2 font-medium ${POOL_STATE[p.state].tone}`}>
            {POOL_STATE[p.state].label(p)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const fmtCount = new Intl.NumberFormat();

/** "· 20 to review", quiet orange, for a model row or a group header. */
const ToReview = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="text-amber-800">{fmtCount.format(count)} to review</span>
  ) : null;

/**
 * One line next to the model control: the review is optional, so it is text,
 * not a badge, and absent when nothing waits.
 */
const ReviewLine = ({ count, href }: { count: number; href?: string }) => {
  if (count <= 0) return null;
  const body = (
    <>
      <LinkIcon />
      <span>
        {fmtCount.format(count)} shared label{count === 1 ? "" : "s"} to review
      </span>
      <span className="text-slate-500">· optional</span>
    </>
  );
  const cls =
    "mt-2 inline-flex items-center gap-1.5 text-xs font-ibm-sans text-amber-800";
  return href ? (
    <Link
      to={href}
      className={`${cls} rounded no-underline hover:text-amber-900 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500`}
      title="Labels shared from this dataset's other models that need a listen"
    >
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
};

const LinkIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);

const modelName = (o: EmbeddingOption) => `${o.name} ${o.version}`;

const onActivateKey = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** The model Annotate uses: the dataset's chosen one, else its first finished one. */
function annotateModelOf(options: EmbeddingOption[]): EmbeddingOption | null {
  const ready = dedupeEmbeddingOptions(options).filter(
    (o) => o.status === "completed",
  );
  return ready.find((o) => o.is_default) ?? ready[0] ?? null;
}

const LayersIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3 3 8l9 5 9-5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

/** Label + value, the same shape for the clickable and the read-only control. */
const ControlFace = ({
  model,
  interactive,
  open,
}: {
  model: EmbeddingOption;
  interactive: boolean;
  open: boolean;
}): ReactNode => (
  <>
    <span
      className={`flex items-center gap-1 px-2 text-fs-10 font-semibold uppercase tracking-wide ${
        interactive
          ? "bg-indigo-50 text-indigo-800"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <LayersIcon />
      Annotating with
    </span>
    <span className="flex items-center gap-1.5 px-2 text-xs font-semibold font-ibm-mono text-slate-900">
      {modelName(model)}
      {interactive && (
        <DownOutlined
          aria-hidden
          className={`text-fs-10 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      )}
    </span>
  </>
);

export const AnnotateModelControl = ({
  dataset,
  options,
  canPick,
  onSaved,
  pendingBySnippetSet = null,
  reviewHref,
  isAdmin = false,
  onRefreshOptions,
}: Props) => {
  const [open, setOpen] = useState(false);
  // A model with its own snippets, or with reference pools to check, waits
  // here for a confirmation. Kept by id so reloaded options show fresh states.
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [startingPools, setStartingPools] = useState(false);
  const setPending = (option: EmbeddingOption | null) =>
    setPendingId(option ? option.embedding_model_id : null);
  const pending =
    pendingId === null
      ? null
      : (options.find(
          (o) => o.embedding_model_id === pendingId && o.status === "completed",
        ) ?? null);
  const pendingBlocking = pending ? blockingPools(pending) : [];
  const poolsEmbedding = pendingBlocking.some((p) => p.state === "embedding");

  // A pool embedding for the chosen model: check again until it finishes.
  useEffect(() => {
    if (!open || !poolsEmbedding || !onRefreshOptions) return;
    const timer = window.setInterval(onRefreshOptions, 10_000);
    return () => window.clearInterval(timer);
  }, [open, poolsEmbedding, onRefreshOptions]);

  const current = annotateModelOf(options);
  if (!current) return null;

  const faceClass =
    "inline-flex h-6 items-stretch overflow-hidden rounded-md border bg-white";
  const pendingOf = (snippetSetId: number) =>
    pendingBySnippetSet?.[String(snippetSetId)] ?? 0;
  const reviewLine = (
    <ReviewLine count={pendingOf(current.snippet_set_id)} href={reviewHref} />
  );

  if (!canPick) {
    return (
      <div className="flex flex-wrap items-center gap-x-3">
        <div
          className={`${faceClass} mt-2 border-slate-200`}
          aria-label={`Annotating with ${modelName(current)}`}
        >
          <ControlFace model={current} interactive={false} open={false} />
        </div>
        {reviewLine}
      </div>
    );
  }

  const save = async (option: EmbeddingOption) => {
    setSaving(true);
    try {
      await datasetApi.update(Number(dataset.id), {
        default_embedding_model_id: option.embedding_model_id,
      });
      message.success(
        `${dataset.name} now uses ${modelName(option)} in Annotate`,
      );
      setPending(null);
      setOpen(false);
      onSaved();
    } catch (err: unknown) {
      message.error(
        getErrorMessage(err as { response?: { data?: { detail?: unknown } } }),
      );
    } finally {
      setSaving(false);
    }
  };

  const pick = (option: EmbeddingOption) => {
    if (saving || option.embedding_model_id === current.embedding_model_id)
      return;
    // Reference pools depend on the model, not on its snippets: a model that
    // shares this one's snippets can still be missing from a pool.
    if (
      option.snippet_set_id === current.snippet_set_id &&
      blockingPools(option).length === 0
    ) {
      void save(option);
    } else {
      setPending(option);
    }
  };

  /** Starts the missing embedding jobs of the chosen model's reference pools. */
  const embedPools = async (option: EmbeddingOption) => {
    const todo = blockingPools(option).filter((p) => p.state !== "embedding");
    if (todo.length === 0) return;
    setStartingPools(true);
    const failed: string[] = [];
    for (const pool of todo) {
      try {
        await embeddingApi.create(pool.dataset_id, {
          embedding_model_id: option.embedding_model_id,
          window_size: option.window_size,
          step_size: option.step_size,
          overlap: option.overlap,
        });
      } catch {
        failed.push(pool.name);
      }
    }
    setStartingPools(false);
    if (failed.length > 0) {
      message.error(`Could not start embedding for ${failed.join(", ")}`);
    } else {
      message.info(
        `Embedding ${todo.length} reference pool${todo.length === 1 ? "" : "s"} with ${modelName(option)}. You can switch once ${todo.length === 1 ? "it finishes" : "they finish"}.`,
      );
    }
    onRefreshOptions?.();
  };

  const groups = groupEmbeddingOptions(options)
    .map((g) => ({
      ...g,
      options: g.options.filter((o) => o.status === "completed"),
    }))
    .filter((g) => g.options.length > 0);
  const severalGroups = groups.length > 1 || groups.some((g) => g.shared);

  const menu = (
    <div className="flex w-[400px] max-w-full flex-col gap-2.5 font-ibm-sans">
      <div className="px-1">
        <div className="text-sm font-semibold text-slate-900">
          Model used in Annotate
        </div>
        <div className="text-xs text-slate-600">
          For {dataset.name} only. Other datasets keep their own.
        </div>
      </div>
      {groups.map((group) => (
        <div key={group.snippetSetId} className="flex flex-col gap-1">
          {severalGroups && (
            <div className="flex items-baseline justify-between gap-2 px-1 text-fs-11">
              <span className="font-semibold uppercase tracking-wide text-slate-600">
                {group.shared ? "Shared" : "Separate"} snippets and labels
              </span>
              {/* Models sharing clips share their suggestions: count once here. */}
              {group.options.length > 1 && (
                <ToReview count={pendingOf(group.snippetSetId)} />
              )}
            </div>
          )}
          {group.options.map((o) => {
            const isCurrent =
              o.embedding_model_id === current.embedding_model_id;
            const isPending =
              pending?.embedding_model_id === o.embedding_model_id;
            return (
              <div
                key={o.embedding_model_id}
                role="radio"
                aria-checked={isCurrent}
                tabIndex={0}
                onClick={() => pick(o)}
                onKeyDown={onActivateKey(() => pick(o))}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isCurrent
                    ? "border-indigo-400 bg-indigo-50/60"
                    : isPending
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-transparent bg-slate-50 hover:border-slate-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    isCurrent ? "border-indigo-800" : "border-slate-400"
                  }`}
                >
                  {isCurrent && (
                    <span className="h-2 w-2 rounded-full bg-indigo-800" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-bold font-ibm-mono text-slate-900">
                    {modelName(o)}
                  </span>
                  <span className="text-xs text-slate-600">
                    {o.window_size} s snippets ·{" "}
                    {o.active_checkpoint_id !== null
                      ? "classifier trained"
                      : "no classifier yet"}
                    {(group.options.length === 1 || !severalGroups) &&
                      pendingOf(o.snippet_set_id) > 0 && (
                        <>
                          {" · "}
                          <ToReview count={pendingOf(o.snippet_set_id)} />
                        </>
                      )}
                    {!isCurrent && blockingPools(o).length > 0 && (
                      <span className="text-amber-800">
                        {" · "}
                        {blockingPools(o).length} reference pool
                        {blockingPools(o).length === 1 ? "" : "s"} missing
                      </span>
                    )}
                  </span>
                </span>
                {isCurrent && (
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-fs-11 font-semibold text-indigo-800">
                    In Annotate
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {pending && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          {pending.snippet_set_id !== current.snippet_set_id && (
            <span>
              {modelName(pending)} uses its own {pending.window_size} s
              snippets, so you'll see different snippets in Annotate. Labels
              you've already made stay where they are.
            </span>
          )}
          {(pending.reference_pools ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <PoolTable option={pending} />
              {pendingBlocking.length > 0 ? (
                <span className="text-amber-800">
                  The classifier trains on these pools too, so they need{" "}
                  {modelName(pending)} embeddings before you can switch.
                  {!isAdmin && " Ask an admin to generate them."}
                </span>
              ) : (
                (pending.reference_pools ?? []).some(
                  (p) => p.state === "no_snippets",
                ) && (
                  <span className="text-slate-600">
                    A pool with no usable snippets (for example, files shorter
                    than {pending.window_size} s) adds nothing to training.
                  </span>
                )
              )}
            </div>
          )}
          {pendingOf(pending.snippet_set_id) > 0 && (
            <span className="text-amber-800">
              {fmtCount.format(pendingOf(pending.snippet_set_id))} shared label
              {pendingOf(pending.snippet_set_id) === 1 ? "" : "s"} on these
              snippets {pendingOf(pending.snippet_set_id) === 1 ? "is" : "are"}{" "}
              waiting for your review (optional).
            </span>
          )}
          <span className="flex justify-end gap-2">
            <Button
              size="small"
              onClick={() => setPending(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            {isAdmin &&
              pendingBlocking.some((p) => p.state !== "embedding") && (
                <Button
                  size="small"
                  loading={startingPools}
                  onClick={() => void embedPools(pending)}
                >
                  Generate{" "}
                  {pendingBlocking.filter((p) => p.state !== "embedding").length}{" "}
                  missing embedding
                  {pendingBlocking.filter((p) => p.state !== "embedding")
                    .length === 1
                    ? ""
                    : "s"}
                </Button>
              )}
            <Button
              size="small"
              type="primary"
              loading={saving}
              disabled={pendingBlocking.length > 0}
              onClick={() => void save(pending)}
              style={
                pendingBlocking.length > 0
                  ? undefined
                  : { backgroundColor: "#1e40af", borderColor: "#1e40af" }
              }
            >
              Switch to {modelName(pending)}
            </Button>
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <Popover
        content={menu}
        trigger={["click"]}
        placement="bottomLeft"
        arrow={false}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPending(null);
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Annotating with ${modelName(current)}. Change model`}
          onKeyDown={onActivateKey(() => setOpen((o) => !o))}
          className={`${faceClass} mt-2 cursor-pointer outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-blue-500 ${
            open
              ? "border-indigo-400 ring-2 ring-indigo-100"
              : "border-indigo-200 hover:border-indigo-400"
          }`}
        >
          <ControlFace model={current} interactive open={open} />
        </div>
      </Popover>
      {reviewLine}
    </div>
  );
};
