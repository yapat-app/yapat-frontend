/**
 * FeedbackButtons — renders feedback UI appropriate for the active study phase.
 *
 * "blind" mode: No predicted labels shown; user selects one or more labels
 *               from the PAM species list / GBIF search and submits them
 *               via a MODIFY action.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spin, message, Tooltip } from "antd";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
  runInference,
  setClassicSnippetAnnotations,
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
  } = useAppSelector((state) => state.al);

  const isClassicFeed = feedSource === "classic";
  const existingFeedback = feedbacks[prediction.snippet_id];
  const hasCheckpoint = usedCheckpointId !== null;
  // During the guided tour, disable all labeling so actions are preview-only.
  const feedbackDisabled = isTourActive || submitting || (!isClassicFeed && !hasCheckpoint);

  // ── Blind-mode autosave plumbing (must be hooks-safe: always declared) ─────
  const snippetAnnotations = classicAnnotationsBySnippet[prediction.snippet_id] ?? [];
  const annotationLabels = snippetAnnotations
    .map(annotationDisplayLabel)
    .filter((name): name is string => Boolean(name));
  const submittedLabels = isClassicFeed
    ? annotationLabels
    : existingFeedback
      ? (existingFeedback.final_labels ?? [])
      : (serverLabels ?? []);
  const lastSyncedSnippetIdRef = useRef<number | null>(null);
  const skipNextAutoSubmitRef = useRef<boolean>(true);
  const lastSubmittedKeyRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);

  const selectionKey = useMemo(
    () => [...selectedLabels].map((s) => s.trim()).filter(Boolean).sort().join("|"),
    [selectedLabels],
  );
  const submittedLabelsKey = useMemo(
    () => [...submittedLabels].map((s) => s.trim()).filter(Boolean).sort().join("|"),
    [submittedLabels],
  );

  const submitClassic = async (_action: FeedbackAction, labels?: string[]) => {
    const normalized = (labels ?? []).map((l) => l.trim()).filter(Boolean);
    const existing =
      classicAnnotationsBySnippet[prediction.snippet_id] ?? [];

    setSubmitting(true);
    setSaveState("saving");
    try {
      const refreshed = await syncClassicSnippetLabels(
        dispatch,
        prediction.snippet_id,
        normalized,
        existing,
        {
          datasetId: selectedDatasetId,
          serverLabels,
        },
      );
      dispatch(
        setClassicSnippetAnnotations({
          snippetId: prediction.snippet_id,
          annotations: refreshed,
        }),
      );
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch (err: unknown) {
      const detail =
        typeof err === "string"
          ? err
          : (err as { message?: string })?.message ?? "Failed to save annotation";
      message.error(detail);
      lastSubmittedKeyRef.current = submittedLabelsKey;
      setSelectedLabels(submittedLabels);
      setSaveState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (action: FeedbackAction, labels?: string[]) => {
    if (isClassicFeed) {
      await submitClassic(action, labels);
      return;
    }
    if (selectedDatasetId === null || modelFamilyName === null) {
      message.error("Select a dataset and run inference first");
      return;
    }
    if (!hasCheckpoint) {
      message.info("No model checkpoint yet. Train/register a checkpoint before submitting feedback.");
      return;
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
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch (e: any) {
      const detail = String(e?.message ?? e ?? "");
      if (
        detail.includes("No prediction found for checkpoint") &&
        selectedDatasetId !== null &&
        modelFamilyName !== null &&
        snippetSetId !== null
      ) {
        message.warning("Model updated — refreshing predictions. Please retry your feedback.");
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
    skipNextAutoSubmitRef.current = true;
    if (lastSyncedSnippetIdRef.current !== prediction.snippet_id) {
      lastSyncedSnippetIdRef.current = prediction.snippet_id;
      setSaveState("idle");
    }
    lastSubmittedKeyRef.current = submittedLabelsKey;
    setSelectedLabels(submittedLabels);
  }, [isBlind, prediction.snippet_id, submittedLabels.join("|"), submittedLabelsKey]);

  // Auto-submit when the user changes labels (blind mode; debounced).
  useEffect(() => {
    if (!isBlind) return;
    if (skipNextAutoSubmitRef.current) {
      skipNextAutoSubmitRef.current = false;
      return;
    }
    if (!isClassicFeed && !hasCheckpoint) return;
    if (feedbackDisabled) return;
    if (selectionKey === lastSubmittedKeyRef.current) return;

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      lastSubmittedKeyRef.current = selectionKey;
      if (selectionKey.length === 0) {
        submit("REJECT");
        return;
      }
      submit("MODIFY", [...selectedLabels]);
    }, 250);

    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [isBlind, selectionKey, hasCheckpoint, feedbackDisabled, selectedLabels]);

  // ── Blind-mode annotation UI ─────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1.5 h-full min-h-0">
      {/* Transient status — only shown while something is happening */}
      {(saveState === "saving" || saveState === "error") && (
        <div className="flex-shrink-0 flex items-center gap-2">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
              <Spin size="small" /> Saving…
            </span>
          )}
          {saveState === "error" && (
            <span className="text-[11px] font-semibold text-red-500">Save failed — try again</span>
          )}
        </div>
      )}
      {!isClassicFeed && !hasCheckpoint && (
        <Tooltip title="Bootstrap mode: no checkpoint yet. Train a model to enable feedback.">
          <span className="flex-shrink-0 text-[11px] text-amber-500 cursor-help w-fit">
            No model checkpoint — feedback disabled
          </span>
        </Tooltip>
      )}

      {/* Compact label picker — fills remaining space */}
      <LabelSelector
        value={selectedLabels}
        onChange={(labels) => {
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
        compact
        showList
        fillHeight
        showSelectedRow={false}
        hideSelectedInInput
      />
    </div>
  );
};
