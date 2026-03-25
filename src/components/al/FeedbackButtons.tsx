/**
 * FeedbackButtons — Accept / Reject / Modify for a prediction card.
 */

import React, { useState } from "react";
import { Button, Popover, Input, Tag, Spin, message } from "antd";
import { CheckOutlined, CloseOutlined, EditOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { submitFeedback } from "../../redux/features/alSlice";
import type { LabelSpaceItem } from "../../types";
import type { PAMPrediction, FeedbackAction } from "../../types/al";
import { LabelSpaceActive } from "./LabelSpaceActive";

interface Props {
  prediction: PAMPrediction;
}

export const FeedbackButtons: React.FC<Props> = ({ prediction }) => {
  const dispatch = useAppDispatch();
  const feedbacks = useAppSelector((state) => state.al.feedbacks);
  const labelSpace = useAppSelector((state) => state.customTaxonomy.labelSpace);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const existingFeedback = feedbacks[prediction.id];
  const isDone = !!existingFeedback;

  const modifyContent = (
    <div className="flex flex-col gap-2 w-80">
      {/* Label-space quick picks */}
      <LabelSpaceActive />
      {/* {labelSpace.length > 0 && (
        <div>
          <span className="text-xs text-gray-400 font-ibm-sans">
            Pick from label space
          </span>
          <div className="flex flex-wrap gap-1 mt-1 max-h-28 overflow-y-auto">
            {(labelSpace as LabelSpaceItem[]).map((l) => (
              <button
                key={l.id}
                onClick={() => submit("MODIFY", l.name)}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 transition-colors font-ibm-sans truncate max-w-[180px]"
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )} */}

      {/* Divider */}
      {labelSpace.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[10px] text-gray-300">or type manually</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}

      {/* Free-text fallback */}
      {/* <span className="text-xs text-gray-500">Enter corrected label</span>
      <Input
        size="small"
        placeholder="e.g. Hyla versicolor"
        value={customLabel}
        onChange={(e) => setCustomLabel(e.target.value)}
        onPressEnter={() => customLabel && submit("MODIFY", customLabel)}
        autoFocus={labelSpace.length === 0}
      />
      <Button
        size="small"
        type="primary"
        disabled={!customLabel}
        onClick={() => submit("MODIFY", customLabel)}
      >
        Confirm
      </Button> */}
    </div>
  );

  const submit = async (action: FeedbackAction, modifiedLabel?: string) => {
    setSubmitting(true);
    try {
      await dispatch(
        submitFeedback({
          prediction_id: prediction.id,
          action,
          ...(modifiedLabel ? { modified_label: modifiedLabel } : {}),
        }),
      ).unwrap();
    } catch {
      message.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
      setModifyOpen(false);
      setCustomLabel("");
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
      MODIFY: `Modified → ${existingFeedback.modified_label ?? ""}`,
    };
    return (
      <div className="flex gap-3">
        <Tag color={colorMap[existingFeedback.action]} className="text-xs">
          {labelMap[existingFeedback.action]}
        </Tag>
        <Popover
          content={modifyContent}
          title="Modify label"
          trigger="click"
          open={modifyOpen}
          onOpenChange={setModifyOpen}
        >
          <Button size="small" icon={<EditOutlined />} disabled={submitting}>
            Modify Label
          </Button>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      {submitting && <Spin size="small" />}
      <Button
        size="small"
        type="primary"
        icon={<CheckOutlined />}
        style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
        disabled={submitting}
        onClick={() => submit("ACCEPT")}
      >
        Accept
      </Button>
      <Button
        size="small"
        danger
        icon={<CloseOutlined />}
        disabled={submitting}
        onClick={() => submit("REJECT")}
      >
        Reject
      </Button>
      {/* <Popover
        content={modifyContent}
        title="Modify label"
        trigger="click"
        open={modifyOpen}
        onOpenChange={setModifyOpen}
      >
        <Button size="small" icon={<EditOutlined />} disabled={submitting}>
          Edit
        </Button>
      </Popover> */}
    </div>
  );
};
