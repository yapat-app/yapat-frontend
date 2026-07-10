/**
 * FeedbackButtons — renders feedback UI appropriate for the active study phase.
 *
 * "guided" mode (default): Accept / Reject / Modify label (existing flow).
 * "blind"  mode (P1.1):    No predicted labels shown; user selects one or more
 *                           labels from the PAM species list / GBIF search and
 *                           submits them via a MODIFY action.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Tag, Spin, message, Tooltip, Input } from "antd";
import { CheckOutlined, CloseOutlined, EditOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
  runInference,
  setClassicSnippetAnnotations,
  submitFeedback,
} from "../../redux/features/alSlice";
import type { ALSnippetLabelDetail, PAMPrediction, FeedbackAction } from "../../types/al";
import { usePhaseConfig } from "../../studyPhases";
import { LabelSelector } from "./LabelSelector";
import { syncClassicSnippetLabels } from "../../utils/syncClassicSnippetLabels";

interface Props {
  prediction: PAMPrediction;
  /** Labels hydrated from /api/pam-al/snippet-labels to survive refresh. */
  serverLabels?: string[];
  /** Source/permission metadata for hydrated labels. */
  serverLabelDetails?: ALSnippetLabelDetail[];
}

function getLabelAttributionTooltip(
  label: string,
  labelDetailsByLabel: Map<string, ALSnippetLabelDetail[]>,
  labelContributors: Record<string, string[]>,
): string {
  const details = labelDetailsByLabel.get(label) ?? [];
  if (details.length > 0) {
    const names = Array.from(
      new Set(details.map((detail) => detail.labeled_by || detail.username).filter(Boolean)),
    );
    if (names.length > 0) return `Annotated by: ${names.join(", ")}`;
  }
  return labelContributors[label]?.length
    ? `Annotated by: ${labelContributors[label].join(", ")}`
    : "Annotator unknown";
}

export const FeedbackButtons: React.FC<Props> = ({
  prediction,
  serverLabels,
  serverLabelDetails = [],
}) => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const isBlind = phase.ui.labelingMode === "blind";

  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const classicAnnotationsBySnippet = useAppSelector(
    (state) => state.al.classicAnnotationsBySnippet,
  );
  const [modifyOpen, setModifyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Guided mode: free-text input
  const [customLabel, setCustomLabel] = useState("");
  // Blind mode: multi-select via LabelSelector
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  const {
    selectedDatasetId,
    modelFamilyName,
    usedCheckpointId,
    snippetSetId,
    inferenceK,
    samplingMethod,
    retrainThreshold,
    feedSource,
  } = useAppSelector((state) => state.al);

  const teamMembers = useAppSelector((s) => s.team.teamMembers);
  const teamMemberNameById = useMemo(
    () => new Map(teamMembers.map((m) => [m.user_id, m.username])),
    [teamMembers],
  );

  const isClassicFeed = feedSource === "classic";
  const existingFeedback = feedbacks[prediction.snippet_id];
  const isDone = !!existingFeedback;
  const hasCheckpoint = usedCheckpointId !== null;
  const feedbackDisabled = submitting || (!isClassicFeed && !hasCheckpoint);

  const labelDetailsByLabel = useMemo(() => {
    const map = new Map<string, ALSnippetLabelDetail[]>();
    for (const detail of serverLabelDetails) {
      const label = detail.label.trim();
      if (!label) continue;
      map.set(label, [...(map.get(label) ?? []), detail]);
    }
    return map;
  }, [serverLabelDetails]);

  const protectedGroundTruthDetails = useMemo(
    () =>
      serverLabelDetails.filter(
        (detail) => detail.source === "ground_truth" && !detail.can_edit,
      ),
    [serverLabelDetails],
  );

  const protectedGroundTruthLabels = useMemo(
    () => new Set(protectedGroundTruthDetails.map((detail) => detail.label)),
    [protectedGroundTruthDetails],
  );

  // ── Blind-mode autosave plumbing (must be hooks-safe: always declared) ─────
  const submittedLabels = (existingFeedback
    ? (existingFeedback.final_labels ?? [])
    : (serverLabels ?? [])
  ).filter((label) => !protectedGroundTruthLabels.has(label));
  const lastSyncedSnippetIdRef = useRef<number | null>(null);
  const skipNextAutoSubmitRef = useRef<boolean>(true);
  const lastSubmittedKeyRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);

  const selectionKey = useMemo(
    () => [...selectedLabels].map((s) => s.trim()).filter(Boolean).sort().join("|"),
    [selectedLabels],
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
      const fb = await dispatch(
        submitFeedback({
          dataset_id: selectedDatasetId,
          model_family_name: modelFamilyName,
          snippet_id: prediction.snippet_id,
          action,
          ...(labels && labels.length > 0 ? { labels } : {}),
        }),
      ).unwrap();

      if (fb.retrain_triggered) {
        message.info(
          `Model update triggered (${fb.feedback_count_since_retrain}/${retrainThreshold}). ` +
          "Retraining started — predictions will refresh when ready.",
        );
      }

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

  const snippetAnnotations = classicAnnotationsBySnippet[prediction.snippet_id] ?? [];
  const labelContributors: Record<string, string[]> = {};
  for (const ann of snippetAnnotations) {
    const label = (ann.resolved_name_snapshot ?? "").trim();
    if (!label) continue;
    const who = (ann.username ?? teamMemberNameById.get(ann.user_id) ?? `user:${ann.user_id}`).trim();
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
    const syncedKey = [...submittedLabels].map((s) => s.trim()).filter(Boolean).sort().join("|");
    lastSubmittedKeyRef.current = syncedKey;
    setSelectedLabels(submittedLabels);
  }, [isBlind, prediction.snippet_id, submittedLabels.join("|")]);

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

  // ── Blind mode ────────────────────────────────────────────────────────────
  if (isBlind) {
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
            setSelectedLabels(labels.filter((label) => !protectedGroundTruthLabels.has(label)));
            setSaveState("idle");
          }}
          getLabelTooltip={(lbl) => getLabelAttributionTooltip(lbl, labelDetailsByLabel, labelContributors)}
          disabled={feedbackDisabled}
          compact
          showList
          fillHeight
          showSelectedRow={false}
          hideSelectedInInput
        />
        {protectedGroundTruthDetails.length > 0 && (
          <div className="flex-shrink-0 flex flex-wrap gap-1 pt-1">
            {protectedGroundTruthDetails.map((detail) => (
              <Tooltip
                key={`${detail.source}:${detail.label}`}
                title={`${detail.labeled_by || "Ground truth"} label. Only admins and team owners can edit it.`}
              >
                <Tag color="gold" className="cursor-help">
                  {detail.label}
                </Tag>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Guided mode (default) ─────────────────────────────────────────────────
  const modifyInline = modifyOpen ? (
    <div className="mt-2 flex flex-col gap-2">
      <Input
        size="small"
        placeholder="Correct label (press Enter to confirm)"
        value={customLabel}
        onChange={(e) => setCustomLabel(e.target.value)}
        onPressEnter={() => customLabel.trim() && submit("MODIFY", [customLabel.trim()])}
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button
          size="small"
          onClick={() => {
            setCustomLabel("");
            setModifyOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button
          size="small"
          type="primary"
          disabled={!customLabel.trim()}
          onClick={() => submit("MODIFY", [customLabel.trim()])}
        >
          Confirm
        </Button>
      </div>
    </div>
  ) : null;

  if (isDone) {
    const colorMap: Record<FeedbackAction, string> = {
      ACCEPT: "success",
      REJECT: "error",
      MODIFY: "processing",
    };
    const labelMap: Record<FeedbackAction, string> = {
      ACCEPT: "Accepted",
      REJECT: "Rejected",
      MODIFY: `Modified → ${(existingFeedback.final_labels ?? []).join(", ")}`,
    };
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-3 items-center">
          <Tag color={colorMap[existingFeedback.action]} className="text-xs">
            {labelMap[existingFeedback.action]}
          </Tag>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={feedbackDisabled}
            onClick={() => setModifyOpen((v) => !v)}
          >
            Modify Label
          </Button>
        </div>
        {existingFeedback.action === "MODIFY" &&
          (existingFeedback.final_labels ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(existingFeedback.final_labels ?? []).map((lbl) => (
                <Tooltip
                  key={lbl}
                  title={
                    getLabelAttributionTooltip(lbl, labelDetailsByLabel, labelContributors)
                  }
                >
                  <Tag className="cursor-help">{lbl}</Tag>
                </Tooltip>
              ))}
            </div>
          )}
        {modifyInline}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 items-center">
        {submitting && <Spin size="small" />}
        <Tooltip
          title={
            hasCheckpoint
              ? null
              : "Bootstrap mode: no checkpoint available yet. Train/register a checkpoint to enable feedback."
          }
        >
          <span className="inline-flex gap-1 items-center">
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              style={{ backgroundColor: "#16a34a", borderColor: "#16a34a", color: "#fff" }}
              disabled={feedbackDisabled}
              onClick={() => submit("ACCEPT")}
            >
              Accept
            </Button>
            <Button
              size="small"
              danger
              icon={<CloseOutlined />}
              disabled={feedbackDisabled}
              onClick={() => submit("REJECT")}
            >
              Reject
            </Button>
          </span>
        </Tooltip>
        <Button
          size="small"
          icon={<EditOutlined />}
          disabled={feedbackDisabled}
          onClick={() => setModifyOpen((v) => !v)}
        >
          Modify
        </Button>
      </div>
      {modifyInline}
    </div>
  );
};
