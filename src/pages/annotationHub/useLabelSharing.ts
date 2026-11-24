/**
 * Optional review of labels shared between a dataset's snippet sets.
 *
 * The backend copies a label to an overlapping clip of another snippet set on
 * its own when the label must hold there; every other overlap becomes a
 * pending suggestion. Reviewing is optional: a pending suggestion writes no
 * label, so its clip stays unlabelled for training and the feed until someone
 * accepts it, and rejecting it changes nothing on the clip either.
 *
 * The hub owns one session per dataset. It covers the clips of the hub's own
 * embedding model (its snippet set), since accepting labels a clip of that set.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import { labelSharingApi } from "../../services/labelSharingApi";
import { datasetApi, getErrorMessage, taskApi } from "../../services/api";
import { buildAnnotationCreatePayload } from "../../utils/annotationCreatePayload";
import { studyLogger } from "../../studyLogging";
import type {
  LabelShareCandidate,
  LabelShareDecision,
  LabelShareReason,
  LabelShareStatus,
  LabelShareSummary,
} from "../../types/labelSharing";

const PAGE_SIZE = 100;
/** Fetch the next page when the reviewer gets this close to the end. */
const PREFETCH_MARGIN = 10;

type Args = {
  datasetId: number | null;
  snippetSetId: number | null;
  embeddingModelId: number | null;
  /** Phase capability `ui.showLabelSharingReview`. */
  enabled: boolean;
};

/** A decision made here, or "taken" when it was settled elsewhere (409, 404). */
export type LocalOutcome = LabelShareStatus | "taken";

export type DecideOptions = {
  input: "keyboard" | "mouse";
  /** Relabel only: the label picked instead of the suggestion. */
  label?: string;
};

export type LabelSharingSession = {
  enabled: boolean;
  summary: LabelShareSummary | null;
  /** Pending suggestions on this model's clips. */
  pendingHere: number;
  /** Pending suggestions on the dataset's other models' clips. */
  pendingElsewhere: number;
  /**
   * Pending per reason on this model's clips, or null when the backend does
   * not report it (the filter then shows no counts).
   */
  pendingByReason: Partial<Record<LabelShareReason, number>> | null;
  reviewing: boolean;
  setReviewing: (active: boolean, source: string) => void;
  reason: LabelShareReason | null;
  setReason: (reason: LabelShareReason | null) => void;
  items: LabelShareCandidate[];
  /** Local outcome of items decided in this session (they stay listed, greyed). */
  decided: Record<number, LocalOutcome>;
  index: number;
  current: LabelShareCandidate | null;
  loading: boolean;
  /** Total pending on the server for the current filter, at the last fetch. */
  total: number;
  busy: boolean;
  go: (index: number) => void;
  step: (delta: 1 | -1) => void;
  decide: (decision: LabelShareDecision, opts: DecideOptions) => Promise<void>;
  /**
   * Transfer the labels on another model's clips onto this model's clips
   * (managers only). Resolves when the background job has been started.
   */
  transferFrom: (
    fromEmbeddingModelId: number,
    fromName: string,
  ) => Promise<void>;
  /** The model a transfer is running from, while it runs. */
  transferring: string | null;
  /** Clips labelled by a person, per snippet set (string keys). */
  labelledBySet: Record<string, number> | null;
  refreshSummary: () => void;
};

/** How often, and for how long, a running transfer is checked. */
const TRANSFER_POLL_MS = 2000;
const TRANSFER_POLL_LIMIT_MS = 30 * 60 * 1000;

/** Reason filter options, in plain words. */
export const REASON_OPTIONS: { value: LabelShareReason; label: string }[] = [
  { value: "partial_overlap", label: "Snippets only partly overlap" },
  { value: "target_shorter", label: "This snippet is shorter" },
  { value: "target_longer", label: "This snippet is longer" },
  { value: "conflict", label: "Conflicts with a label" },
  { value: "source_removed", label: "Source label removed" },
];

/** mm:ss, for times in plain sentences. */
const minSec = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Plain-words reason shown to the reviewer. */
export function describeReason(c: LabelShareCandidate): {
  title: string;
  detail: string;
} {
  const srcLen = c.source.end_time - c.source.start_time;
  const tgtLen = c.target.end_time - c.target.start_time;
  const overlap = c.overlap_seconds.toFixed(1);
  switch (c.reason) {
    case "partial_overlap":
      return {
        title: `The snippets only partly overlap (${overlap} s of ${srcLen.toFixed(1)} s).`,
        detail:
          "The sound may be in the part outside this snippet. Listen to the shaded part.",
      };
    case "target_shorter":
      return {
        title: `This snippet is shorter (${tgtLen.toFixed(1)} s) than the labelled one (${srcLen.toFixed(1)} s).`,
        detail: "The call may be outside this snippet.",
      };
    case "target_longer":
      return {
        title: `This snippet is longer (${tgtLen.toFixed(1)} s) than the one marked “${c.label}” (${srcLen.toFixed(1)} s).`,
        detail: "The rest of this snippet may contain a sound.",
      };
    case "conflict":
      return {
        title: "This snippet already has a label of the opposite kind.",
        detail:
          "One label says there is no animal sound, the other names a species. Accepting adds this label next to the existing one.",
      };
    case "source_removed":
      return {
        title: `The label it was shared from was removed from the ${srcLen.toFixed(0)} s snippet at ${minSec(c.source.start_time)}–${minSec(c.source.end_time)}.`,
        detail:
          "Keep it if it still holds for this snippet, or remove it. Nothing changes until you decide.",
      };
  }
}

export function useLabelSharing({
  datasetId,
  snippetSetId,
  embeddingModelId,
  enabled,
}: Args): LabelSharingSession {
  const [summary, setSummary] = useState<LabelShareSummary | null>(null);
  const [reviewing, setReviewingState] = useState(false);
  const [reason, setReason] = useState<LabelShareReason | null>(null);
  const [items, setItems] = useState<LabelShareCandidate[]>([]);
  const [decided, setDecided] = useState<Record<number, LocalOutcome>>({});
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [summaryRev, setSummaryRev] = useState(0);
  const openedAtRef = useRef<number>(Date.now());
  const loadingMoreRef = useRef(false);

  const active = enabled && datasetId !== null;

  // ── Summary ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || datasetId === null) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    labelSharingApi
      .getSummary(datasetId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        // Older backends have no label sharing: the feature stays hidden.
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, datasetId, summaryRev]);

  const refreshSummary = useCallback(() => setSummaryRev((r) => r + 1), []);

  const pendingHere =
    summary && snippetSetId !== null
      ? (summary.pending_by_snippet_set[String(snippetSetId)] ?? 0)
      : 0;
  const pendingElsewhere = summary
    ? Math.max(0, summary.pending - pendingHere)
    : 0;
  const byReason = summary?.pending_by_snippet_set_reason;
  const pendingByReason = useMemo(
    () =>
      byReason && snippetSetId !== null
        ? (byReason[String(snippetSetId)] ?? {})
        : null,
    [byReason, snippetSetId],
  );

  // Leave review when the dataset or model changes under it.
  useEffect(() => {
    setReviewingState(false);
    setReason(null);
  }, [datasetId, snippetSetId]);

  // ── Queue ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!reviewing || datasetId === null || snippetSetId === null) {
      setItems([]);
      setDecided({});
      setIndex(0);
      setTotal(0);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    labelSharingApi
      .listCandidates(
        datasetId,
        {
          status: "pending",
          snippet_set_id: snippetSetId,
          ...(reason ? { reason } : {}),
          limit: PAGE_SIZE,
        },
        controller.signal,
      )
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
        setDecided({});
        setIndex(0);
        openedAtRef.current = Date.now();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        message.error(getErrorMessage(err) || "Could not load shared labels");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reviewing, datasetId, snippetSetId, reason]);

  // Next page: decided items have left the server's pending list, so the
  // offset is the number of loaded items still pending.
  const stillPendingLoaded = items.length - Object.keys(decided).length;
  useEffect(() => {
    if (!reviewing || datasetId === null || snippetSetId === null) return;
    if (loadingMoreRef.current) return;
    if (index < items.length - PREFETCH_MARGIN) return;
    if (stillPendingLoaded >= total) return;
    loadingMoreRef.current = true;
    labelSharingApi
      .listCandidates(datasetId, {
        status: "pending",
        snippet_set_id: snippetSetId,
        ...(reason ? { reason } : {}),
        skip: stillPendingLoaded,
        limit: PAGE_SIZE,
      })
      .then((page) => {
        setItems((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
        });
        setTotal(page.total + Object.keys(decided).length);
      })
      .catch(() => {
        /* the reviewer can still work through what is loaded */
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  }, [
    reviewing,
    datasetId,
    snippetSetId,
    reason,
    index,
    items.length,
    stillPendingLoaded,
    total,
    decided,
  ]);

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i >= items.length) return;
      setIndex(i);
      openedAtRef.current = Date.now();
    },
    [items.length],
  );
  const step = useCallback((delta: 1 | -1) => go(index + delta), [go, index]);

  const setReviewing = useCallback(
    (on: boolean, source: string) => {
      setReviewingState((was) => {
        if (was !== on) {
          studyLogger.log("shared_review_toggle", {
            active: on,
            pending: pendingHere,
            source,
          });
        }
        return on;
      });
      if (on) refreshSummary();
    },
    [pendingHere, refreshSummary],
  );

  // Quick labels pair a label's text with its taxon, so a relabel to "HYLMER"
  // stores the real taxon instead of a local id.
  const quickLabelTaxaRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    quickLabelTaxaRef.current = new Map();
    if (!reviewing || datasetId === null) return;
    let cancelled = false;
    datasetApi
      .getQuickLabels(datasetId)
      .then((list) => {
        if (cancelled) return;
        quickLabelTaxaRef.current = new Map(
          list.map((q) => [q.display_name.trim().toLowerCase(), q.taxon_id]),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reviewing, datasetId]);

  const current = items[index] ?? null;

  const decide = useCallback(
    async (decision: LabelShareDecision, opts: DecideOptions) => {
      const c = items[index];
      if (!c || busy || decided[c.id]) return;
      setBusy(true);
      let outcome: LocalOutcome =
        decision === "accept"
          ? "accepted"
          : decision === "reject"
            ? "rejected"
            : "relabelled";
      const recheck = c.reason === "source_removed";
      try {
        if (recheck && decision === "relabel") return;
        if (decision === "accept") {
          await labelSharingApi.accept(c.id, embeddingModelId);
          message.success(recheck ? `Kept ${c.label}` : `Added ${c.label}`, 1.5);
        } else if (decision === "reject") {
          await labelSharingApi.reject(c.id);
          message.info(
            recheck
              ? `Removed ${c.label} from this snippet`
              : "Suggestion rejected; the snippet keeps its labels",
            1.5,
          );
        } else {
          const label = (opts.label ?? "").trim();
          if (!label) return;
          const taxonId =
            quickLabelTaxaRef.current.get(label.toLowerCase()) ??
            buildAnnotationCreatePayload(c.target.snippet_id, label, null)
              .taxon_id;
          await labelSharingApi.relabel(
            c.id,
            { taxon_id: taxonId!, display_name: label },
            embeddingModelId,
          );
          message.success(`Added ${label} instead`, 1.5);
        }
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 409) {
          // Someone else reviewed it first: nothing left to decide here.
          message.info("Already reviewed by someone else", 1.5);
          outcome = "taken";
        } else if (status === 404) {
          // Settled meanwhile, e.g. the snippet got this label another way.
          message.info("This suggestion is no longer open", 1.5);
          outcome = "taken";
        } else {
          message.error(getErrorMessage(err) || "Could not save the decision");
          return;
        }
      } finally {
        setBusy(false);
      }
      studyLogger.log(
        "shared_review_decision",
        {
          candidateId: c.id,
          decision,
          reason: c.reason,
          suggestedLabel: c.label,
          ...(opts.label ? { label: opts.label } : {}),
          input: opts.input,
          dwellMs: Date.now() - openedAtRef.current,
        },
        { snippetId: c.target.snippet_id },
      );
      setDecided((d) => ({ ...d, [c.id]: outcome }));
      setSummary((s) => {
        if (!s) return s;
        const key = String(c.target.snippet_set_id);
        const byReason = s.pending_by_snippet_set_reason;
        return {
          ...s,
          ...(byReason
            ? {
                pending_by_snippet_set_reason: {
                  ...byReason,
                  [key]: {
                    ...byReason[key],
                    [c.reason]: Math.max(
                      0,
                      (byReason[key]?.[c.reason] ?? 1) - 1,
                    ),
                  },
                },
              }
            : {}),
          pending: Math.max(0, s.pending - 1),
          pending_by_snippet_set: {
            ...s.pending_by_snippet_set,
            [key]: Math.max(0, (s.pending_by_snippet_set[key] ?? 1) - 1),
          },
          ...(outcome === "accepted" ? { accepted: s.accepted + 1 } : {}),
          ...(outcome === "rejected" ? { rejected: s.rejected + 1 } : {}),
          ...(outcome === "relabelled" ? { relabelled: s.relabelled + 1 } : {}),
        };
      });
      // Next undecided item after this one.
      const next = items.findIndex(
        (it, i) => i > index && !decided[it.id] && it.id !== c.id,
      );
      if (next >= 0) go(next);
    },
    [items, index, busy, decided, embeddingModelId, go],
  );

  // ── Transfer ───────────────────────────────────────────────────────────
  const pollTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pollTimerRef.current !== null)
        window.clearTimeout(pollTimerRef.current);
    },
    [],
  );

  const transferFrom = useCallback(
    async (fromEmbeddingModelId: number, fromName: string) => {
      if (datasetId === null || embeddingModelId === null) return;
      setTransferring(fromName);
      let taskId: string | null = null;
      try {
        ({ task_id: taskId } = await labelSharingApi.shareDataset(datasetId, {
          fromEmbeddingModelId,
          toEmbeddingModelId: embeddingModelId,
        }));
      } catch (err) {
        setTransferring(null);
        message.error(getErrorMessage(err) || "Could not start the transfer");
        return;
      }
      studyLogger.log("shared_label_transfer", {
        fromEmbeddingModelId,
        toEmbeddingModelId: embeddingModelId,
      });
      const done = (text: string, ok = true) => {
        pollTimerRef.current = null;
        setTransferring(null);
        refreshSummary();
        if (ok) message.success(text);
        else message.error(text);
      };
      if (!taskId) {
        done("Transfer started. Counts update when it finishes.");
        return;
      }
      const startedAt = Date.now();
      const poll = async () => {
        try {
          const s = await taskApi.getStatus(taskId);
          if (s.ready) {
            if (!s.successful) {
              done(s.error || "The transfer failed.", false);
              return;
            }
            const r = (s.result ?? {}) as {
              auto_shared?: number;
              queued?: number;
            };
            const fmt = new Intl.NumberFormat();
            done(
              `Labels from ${fromName}: ${fmt.format(r.auto_shared ?? 0)} copied, ` +
                `${fmt.format(r.queued ?? 0)} new suggestions to review.`,
            );
            return;
          }
        } catch {
          // A missed check is retried on the next tick.
        }
        if (Date.now() - startedAt > TRANSFER_POLL_LIMIT_MS) {
          done(
            "The transfer is still running. Counts update when it finishes.",
          );
          return;
        }
        refreshSummary();
        pollTimerRef.current = window.setTimeout(poll, TRANSFER_POLL_MS);
      };
      pollTimerRef.current = window.setTimeout(poll, TRANSFER_POLL_MS);
    },
    [datasetId, embeddingModelId, refreshSummary],
  );

  return useMemo(
    () => ({
      enabled: active && summary !== null,
      summary,
      pendingHere,
      pendingElsewhere,
      pendingByReason,
      reviewing,
      setReviewing,
      reason,
      setReason,
      items,
      decided,
      index,
      current,
      loading,
      total,
      busy,
      go,
      step,
      decide,
      transferFrom,
      transferring,
      labelledBySet: summary?.labelled_by_snippet_set ?? null,
      refreshSummary,
    }),
    [
      active,
      summary,
      pendingHere,
      pendingElsewhere,
      pendingByReason,
      reviewing,
      setReviewing,
      reason,
      items,
      decided,
      index,
      current,
      loading,
      total,
      busy,
      go,
      step,
      decide,
      transferFrom,
      transferring,
      refreshSummary,
    ],
  );
}
