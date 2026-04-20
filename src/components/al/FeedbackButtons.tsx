/**
 * FeedbackButtons — Accept / Reject / Modify for a prediction card.
 */

import React, { useState } from "react";
import { Button, Tag, Spin, message, Tooltip, Input } from "antd";
import { CheckOutlined, CloseOutlined, EditOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { runInference, submitFeedback } from "../../redux/features/alSlice";
import type { PAMPrediction, FeedbackAction } from "../../types/al";

interface Props {
  prediction: PAMPrediction;
}

export const FeedbackButtons: React.FC<Props> = ({ prediction }) => {
  const dispatch = useAppDispatch();
  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const { selectedDatasetId, modelFamilyName, usedCheckpointId, snippetSetId, inferenceK, samplingMethod, retrainThreshold } =
    useAppSelector((state) => state.al);

  const existingFeedback = feedbacks[prediction.snippet_id];
  const isDone = !!existingFeedback;
  const hasCheckpoint = usedCheckpointId !== null;
  const feedbackDisabled = submitting || !hasCheckpoint;

  const modifyInline = modifyOpen ? (
    <div className="mt-2 flex flex-col gap-2">
      <Input
        size="small"
        placeholder="Correct label (press Enter to confirm)"
        value={customLabel}
        onChange={(e) => setCustomLabel(e.target.value)}
        onPressEnter={() => customLabel.trim() && submit("MODIFY", customLabel.trim())}
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
          onClick={() => submit("MODIFY", customLabel.trim())}
        >
          Confirm
        </Button>
      </div>
    </div>
  ) : null;

  const submit = async (action: FeedbackAction, modifiedLabel?: string) => {
    if (selectedDatasetId === null || modelFamilyName === null) {
      message.error("Select a dataset and run inference first");
      return;
    }
    if (!hasCheckpoint) {
      message.info("No model checkpoint yet. Train/register a checkpoint before submitting feedback.");
      return;
    }
    setSubmitting(true);
    try {
      const fb = await dispatch(
        submitFeedback({
          dataset_id: selectedDatasetId,
          model_family_name: modelFamilyName,
          snippet_id: prediction.snippet_id,
          action,
          ...(modifiedLabel ? { labels: [modifiedLabel] } : {}),
        }),
      ).unwrap();

      // If this feedback hit the backend threshold, the backend already dispatched an auto-retrain job.
      // Tell the user immediately that the model is being updated and predictions will refresh.
      if (fb.retrain_triggered) {
        message.info(
          `Model update triggered (${fb.feedback_count_since_retrain}/${retrainThreshold}). ` +
          "Retraining started — predictions will refresh when ready.",
        );
      }
    } catch (e: any) {
      const detail = String(e?.message ?? e ?? "");
      // Common case after retrain/checkpoint switch: UI feed is stale and snippet has no prediction
      // under the backend's current active checkpoint.
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
      } else {
        message.error("Failed to submit feedback");
      }
    } finally {
      setSubmitting(false);
      setModifyOpen(false);
    }
  };

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
