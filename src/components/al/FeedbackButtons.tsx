/**
 * FeedbackButtons — renders feedback UI appropriate for the active study phase.
 *
 * "blind" mode: No predicted labels shown; user selects one or more labels
 *               from the PAM species list / GBIF search and submits them
 *               via a MODIFY action.
 *
 * Bootstrap (AL feed, no checkpoint yet): labels go to the same feedback
 * endpoint as MODIFY with the snippet set's embedding model; the request that
 * reaches the dataset's threshold trains the first model before it returns.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spin, message, Tooltip } from "antd";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
  fetchFeedbackCount,
  runInference,
  setClassicSnippetAnnotations,
  submitBootstrapFeedback,
  submitFeedback,
} from "../../redux/features/alSlice";
import type { PAMPrediction, FeedbackAction } from "../../types/al";
import { usePhaseConfig } from "../../studyPhases";
import { studyLogger } from "../../studyLogging";
import { useStudyFlow } from "../../studyFlow";
import { LabelSelector } from "./LabelSelector";
import { annotationDisplayLabel } from "../../utils/classicFeedSync";
import { syncClassicSnippetLabels } from "../../utils/syncClassicSnippetLabels";

interface Props {
  prediction: PAMPrediction;
  /** Labels hydrated from /api/pam-al/snippet-labels to survive refresh. */
  serverLabels?: string[];
  /** Dataset-wide quick labels resolved once by AnnotationHub. */
  quickLabels?: string[];
  quickLabelsLoading?: boolean;
}

export const FeedbackButtons: React.FC<Props> = ({
  prediction,
  serverLabels,
  quickLabels = [],
  quickLabelsLoading = false,
}) => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const { isTourActive } = useStudyFlow();
  const isBlind = phase.ui.labelingMode === "blind";

  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const classicAnnotationsBySnippet = useAppSelector(
    (state) => state.al.classicAnnotationsBySnippet,
  );
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  // Blind mode: multi-select via LabelSelector
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  const {
    selectedDatasetId,
    modelFamilyName,
    usedCheckpointId,
    snippetSetId,
    inferenceK,
    samplingMethod,
    feedSource,
    embeddingModelId,
    bootstrapSubmitting,
    feedbackCount,
    retrainThreshold,
  } = useAppSelector((state) => state.al);

  const isClassicFeed = feedSource === "classic";
  const existingFeedback = feedbacks[prediction.snippet_id];
  const hasCheckpoint = usedCheckpointId !== null;
  // No model yet: labels are bootstrap feedback toward the first model.
  const isBootstrap = !isClassicFeed && !hasCheckpoint;
  // The request that reaches the threshold trains the first model.
  const trainingFirstModel =
    isBootstrap && bootstrapSubmitting && feedbackCount + 1 >= retrainThreshold;
  // During the guided tour, disable all labeling so actions are preview-only.
  // In bootstrap, one request at a time across all cards: the training one
  // can take minutes and must not be sent twice.
  const feedbackDisabled =
    isTourActive || submitting || (isBootstrap && bootstrapSubmitting);

  // ── Blind-mode autosave plumbing (must be hooks-safe: always declared) ─────
  const snippetAnnotations =
    classicAnnotationsBySnippet[prediction.snippet_id] ?? [];
  const annotationLabels = snippetAnnotations
    .map(annotationDisplayLabel)
    .filter((name): name is string => Boolean(name));
  const submittedLabels = isClassicFeed
    ? annotationLabels
    : existingFeedback
      ? (existingFeedback.final_labels ?? [])
      : (serverLabels ?? []);
  const lastSyncedSnippetIdRef = useRef<number | null>(null);
  // Autosave must only ever persist a USER edit. Every LabelSelector change
  // bumps userEditRevRef; the sync effect records the revision it synced at.
  // A selection change without a newer user edit (mount, remount, server
  // refresh, snippet switch arriving before the synced labels render) is
  // never submitted — previously such transient empty selections could
  // REJECT, i.e. wipe, a snippet's existing labels.
  const userEditRevRef = useRef(0);
  const syncedEditRevRef = useRef(0);
  // Selection key the sync effect just wrote, so the auto-submit effect can
  // skip that exact state instead of treating it as a user edit. A bare
  // boolean flag can be re-armed by a later sync run and swallow the user's
  // next real edit; matching on the key avoids that.
  const skipAutoSubmitKeyRef = useRef<string | null>("");
  const lastSubmittedKeyRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);
  const pendingSubmitRef = useRef<(() => void) | null>(null);
  // Number of submit() calls for the current snippet that have been fired but
  // not yet resolved. While > 0 the user's local selection is authoritative
  // and must not be overwritten by an incoming (still-stale) server sync.
  const inFlightSubmitRef = useRef<number>(0);

  const selectionKey = useMemo(
    () =>
      [...selectedLabels]
        .map((s) => s.trim())
        .filter(Boolean)
        .sort()
        .join("|"),
    [selectedLabels],
  );

  const submitClassic = async (
    _action: FeedbackAction,
    labels?: string[],
  ): Promise<boolean> => {
    const normalized = (labels ?? []).map((l) => l.trim()).filter(Boolean);
    const existing = classicAnnotationsBySnippet[prediction.snippet_id] ?? [];

    setSubmitting(true);
    setSaveState("saving");
    try {
      const refreshed = await syncClassicSnippetLabels(
        dispatch,
        prediction.snippet_id,
        normalized,
        existing,
      );
      dispatch(
        setClassicSnippetAnnotations({
          snippetId: prediction.snippet_id,
          annotations: refreshed,
        }),
      );
      setSaveState("saved");
      window.setTimeout(
        () => setSaveState((s) => (s === "saved" ? "idle" : s)),
        1800,
      );
      return true;
    } catch (err: unknown) {
      const detail =
        typeof err === "string"
          ? err
          : ((err as { message?: string })?.message ??
            "Failed to save annotation");
      message.error(detail);
      setSaveState("error");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const submitBootstrap = async (
    datasetId: number,
    family: string,
    action: FeedbackAction,
    labels?: string[],
  ): Promise<boolean> => {
    const normalized = (labels ?? []).map((l) => l.trim()).filter(Boolean);
    // Bootstrap feedback is MODIFY with labels only: with no model there is
    // nothing to accept or reject (the backend answers 400).
    if (action !== "MODIFY" || normalized.length === 0) {
      message.info("Pick at least one label: the first model trains on labelled snippets.");
      return false;
    }
    if (embeddingModelId === null) {
      message.error("This dataset's embedding model is unknown. Reload the feed and try again.");
      return false;
    }
    setSubmitting(true);
    setSaveState("saving");
    try {
      const fb = await dispatch(
        submitBootstrapFeedback({
          dataset_id: datasetId,
          model_family_name: family,
          snippet_id: prediction.snippet_id,
          action: "MODIFY",
          labels: normalized,
          embedding_model_id: embeddingModelId,
        }),
      ).unwrap();
      studyLogger.log(
        "feedback_submit",
        { action: "MODIFY", labels: normalized },
        { snippetId: prediction.snippet_id },
      );
      if (fb.retrain_triggered && fb.active_checkpoint_id) {
        message.success("First model trained. Loading its predictions…");
      }
      setSaveState("saved");
      window.setTimeout(
        () => setSaveState((s) => (s === "saved" ? "idle" : s)),
        1800,
      );
      return true;
    } catch (e: unknown) {
      const detail = String((e as { message?: string })?.message ?? e ?? "");
      // The label is stored before training starts, so a failed training run
      // still counts this snippet. Re-read the counter to tell the two apart.
      const counted = await dispatch(
        fetchFeedbackCount({ dataset_id: datasetId, model_family_name: family }),
      );
      const reachedThreshold =
        fetchFeedbackCount.fulfilled.match(counted) &&
        counted.payload.feedback_count_since_retrain >= counted.payload.retrain_after;
      if (detail.includes("No labels found in user annotations")) {
        // Only No biophony / Other biophony so far: saved, but nothing to train on.
        message.warning(
          "Label saved. The first model needs at least one species label (No/Other biophony alone can't train it).",
        );
        setSaveState("idle");
        return true;
      }
      if (reachedThreshold) {
        message.error(`Label saved, but training the first model failed: ${detail}`);
        setSaveState("idle");
        return true;
      }
      message.error(detail || "Failed to submit feedback");
      setSaveState("error");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (
    action: FeedbackAction,
    labels?: string[],
  ): Promise<boolean> => {
    if (isClassicFeed) {
      return submitClassic(action, labels);
    }
    if (selectedDatasetId === null || modelFamilyName === null) {
      message.error("Select a dataset and run inference first");
      return false;
    }
    if (!hasCheckpoint) {
      return submitBootstrap(selectedDatasetId, modelFamilyName, action, labels);
    }
    setSubmitting(true);
    setSaveState("saving");
    try {
      await dispatch(
        submitFeedback({
          dataset_id: selectedDatasetId,
          model_family_name: modelFamilyName,
          snippet_id: prediction.snippet_id,
          action,
          ...(labels && labels.length > 0 ? { labels } : {}),
        }),
      ).unwrap();

      studyLogger.log(
        "feedback_submit",
        { action, labels: labels ?? [] },
        { snippetId: prediction.snippet_id },
      );

      setSaveState("saved");
      // Auto-dismiss the "Saved" indicator so it doesn't linger.
      window.setTimeout(
        () => setSaveState((s) => (s === "saved" ? "idle" : s)),
        1800,
      );
      return true;
    } catch (e: any) {
      const detail = String(e?.message ?? e ?? "");
      if (
        detail.includes("No prediction found for checkpoint") &&
        selectedDatasetId !== null &&
        modelFamilyName !== null &&
        snippetSetId !== null
      ) {
        message.warning(
          "Model updated — refreshing predictions. Please retry your feedback.",
        );
        dispatch(
          runInference({
            model_family_name: modelFamilyName,
            dataset_id: selectedDatasetId,
            snippet_set_id: snippetSetId,
            force_refresh: true,
            sample_suggestion: true,
            suggestion_strategy: samplingMethod,
            k: inferenceK,
          }),
        );
        setSaveState("error");
      } else {
        message.error("Failed to submit feedback");
        setSaveState("error");
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const labelContributors: Record<string, string[]> = {};
  for (const ann of snippetAnnotations) {
    const label = annotationDisplayLabel(ann);
    if (!label) continue;
    const who = (ann.username ?? `user:${ann.user_id}`).trim();
    if (!labelContributors[label]) labelContributors[label] = [];
    if (!labelContributors[label].includes(who)) {
      labelContributors[label].push(who);
    }
  }

  // Sync local selection from backend feedback when in blind mode.
  // Never touch saveState here — the submit() function owns that lifecycle.
  useEffect(() => {
    if (!isBlind) return;
    const snippetChanged =
      lastSyncedSnippetIdRef.current !== prediction.snippet_id;
    if (snippetChanged) {
      // A debounced edit for the outgoing snippet hasn't been persisted yet —
      // flush it now rather than letting the auto-submit effect's cleanup
      // (triggered a moment later by resetting selectedLabels below) cancel
      // it and drop the label on the floor.
      if (pendingSubmitRef.current) {
        if (debounceTimerRef.current) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        const flush = pendingSubmitRef.current;
        pendingSubmitRef.current = null;
        flush();
      }
      // The new snippet starts with a clean submit slate.
      inFlightSubmitRef.current = 0;
      lastSyncedSnippetIdRef.current = prediction.snippet_id;
      setSaveState("idle");
    } else {
      const hasUnconfirmedEdit =
        pendingSubmitRef.current !== null || inFlightSubmitRef.current > 0;
      if (hasUnconfirmedEdit) return;
    }
    const syncedKey = [...submittedLabels]
      .map((s) => s.trim())
      .filter(Boolean)
      .sort()
      .join("|");
    syncedEditRevRef.current = userEditRevRef.current;
    skipAutoSubmitKeyRef.current = syncedKey;
    lastSubmittedKeyRef.current = syncedKey;
    setSelectedLabels(submittedLabels);
  }, [isBlind, prediction.snippet_id, submittedLabels.join("|")]);

  // Auto-submit when the user changes labels (blind mode; debounced).
  useEffect(() => {
    if (!isBlind) return;
    // Skip only the auto-submit for the exact state the sync effect just wrote.
    // A genuine user edit changes selectionKey, so it never matches here.
    if (skipAutoSubmitKeyRef.current === selectionKey) {
      skipAutoSubmitKeyRef.current = null;
      return;
    }
    if (feedbackDisabled) return;
    if (userEditRevRef.current === syncedEditRevRef.current) return;
    if (selectionKey === lastSubmittedKeyRef.current) return;
    // Bootstrap can't clear a snippet (no REJECT without a model): put the
    // saved labels back instead of leaving an unsaved empty selection.
    if (isBootstrap && selectionKey.length === 0) {
      message.info(
        "Labels can't be cleared before the first model exists. Pick another label instead.",
      );
      syncedEditRevRef.current = userEditRevRef.current;
      skipAutoSubmitKeyRef.current = lastSubmittedKeyRef.current;
      setSelectedLabels(submittedLabels);
      return;
    }

    const doSubmit = () => {
      pendingSubmitRef.current = null;
      debounceTimerRef.current = null;
      const keyBeingSubmitted = selectionKey;
      const labelsBeingSubmitted = [...selectedLabels];
      const snippetIdAtSubmitTime = prediction.snippet_id;
      inFlightSubmitRef.current += 1;
      void (async () => {
        const ok =
          keyBeingSubmitted.length === 0
            ? await submit("REJECT")
            : await submit("MODIFY", labelsBeingSubmitted);
        if (lastSyncedSnippetIdRef.current === snippetIdAtSubmitTime) {
          inFlightSubmitRef.current = Math.max(
            0,
            inFlightSubmitRef.current - 1,
          );
        }
        if (ok && lastSyncedSnippetIdRef.current === snippetIdAtSubmitTime) {
          lastSubmittedKeyRef.current = keyBeingSubmitted;
        }
      })();
    };

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    pendingSubmitRef.current = doSubmit;
    debounceTimerRef.current = window.setTimeout(doSubmit, 250);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // The timer for this selection is gone, so its submit must go too.
      // Leaving it queued let the snippet-change flush above fire a stale
      // submit — e.g. the transient empty selection seen on mount, which
      // REJECTed (wiped) the labels of the snippet the bar mounted on.
      if (pendingSubmitRef.current === doSubmit) {
        pendingSubmitRef.current = null;
      }
    };
  }, [isBlind, selectionKey, hasCheckpoint, feedbackDisabled, selectedLabels, isBootstrap]);

  // ── Blind-mode annotation UI ─────────────────────────────────────────────
  return (
    // flex-1 (rather than h-full) so this works both inside the fixed-height
    // inline label area and inside the sticky label bar, whose height is
    // capped by a max-height rather than being definite.
    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
      {isBootstrap &&
        (trainingFirstModel ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-fs-11 text-blue-600 w-fit">
            <Spin size="small" /> Training first model… this can take a few minutes
          </span>
        ) : (
          <Tooltip title="No model yet. Once this many snippets are labelled, the first model is trained and the feed is ranked by it. At least one label must be a species.">
            <span className="shrink-0 text-fs-11 text-amber-600 cursor-help w-fit">
              The first model trains after you label {retrainThreshold} snippets ·{" "}
              {Math.min(feedbackCount, retrainThreshold)} / {retrainThreshold} done
            </span>
          </Tooltip>
        ))}

      {/* Compact label picker — fills remaining space */}
      <LabelSelector
        value={selectedLabels}
        onChange={(labels) => {
          userEditRevRef.current += 1;
          setSelectedLabels(labels);
          setSaveState("idle");
        }}
        getLabelTooltip={(lbl) =>
          labelContributors[lbl]?.length
            ? `Annotated by: ${labelContributors[lbl].join(", ")}`
            : "Annotator unknown"
        }
        disabled={feedbackDisabled}
        quickLabels={quickLabels}
        labelsLoading={quickLabelsLoading}
        // Rendered inside the "Quick labels" header row rather than as its own
        // row: this panel's height feeds the spectrogram sizing, so a status
        // line that appears and disappears on every save would resize the
        // spectrogram on every label change.
        statusSlot={
          saveState === "saving" ? (
            <span className="inline-flex items-center gap-1.5 text-fs-11 text-gray-400 whitespace-nowrap">
              <Spin size="small" /> Saving…
            </span>
          ) : saveState === "error" ? (
            <span className="text-fs-11 font-semibold text-red-500 whitespace-nowrap">
              Save failed — try again
            </span>
          ) : null
        }
        compact
        showList
        fillHeight
        showSelectedRow={false}
        hideSelectedInInput
      />
    </div>
  );
};
