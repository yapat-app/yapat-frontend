/**
 * RetrainControl — feedback progress + manual retrain trigger.
 */

import React from "react";
import { Button, Progress, Tag, Tooltip, Spin } from "antd";
import { ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { triggerRetrain, runInference, pollRetrainJob } from "../../redux/features/alSlice";

export const RetrainControl: React.FC = () => {
  const dispatch = useAppDispatch();
  const {
    feedbackCount,
    retrainThreshold,
    modelFamilyName,
    snippetSetId,
    inferenceK,
    retrainLoading,
    lastRetrainJob,
    selectedDatasetId,
  } = useAppSelector((state) => state.al);

  const progressPercent = Math.min(
    Math.round((feedbackCount / retrainThreshold) * 100),
    100,
  );

  const handleManualRetrain = async () => {
    if (selectedDatasetId === null || modelFamilyName === null) return;
    const result = await dispatch(
      triggerRetrain({ dataset_id: selectedDatasetId, model_family_name: modelFamilyName }),
    );
    if (!triggerRetrain.fulfilled.match(result) || snippetSetId === null) return;
    const jobId = result.payload.job_id;

    // poll job status and refresh inference when completed
    for (let i = 0; i < 120; i++) {
      const statusResult = await dispatch(pollRetrainJob(jobId));
      if (pollRetrainJob.fulfilled.match(statusResult)) {
        const status = statusResult.payload.status;
        if (status === "COMPLETED" || status === "FAILED") break;
      } else {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    dispatch(
      runInference({
        model_family_name: modelFamilyName,
        dataset_id: selectedDatasetId,
        snippet_set_id: snippetSetId,
        k: inferenceK,
        force_refresh: true,
      }),
    );
  };

  const statusTag = () => {
    if (!lastRetrainJob) return null;
    const colorMap = {
      PENDING: "default",
      RUNNING: "processing",
      COMPLETED: "success",
      FAILED: "error",
    } as const;
    return (
      <Tag color={colorMap[lastRetrainJob.status]}>
        {lastRetrainJob.status === "RUNNING" && (
          <Spin size="small" className="mr-1" />
        )}
        Model: {lastRetrainJob.status}
      </Tag>
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
      <div className="flex items-center justify-between mb-2 ">
        <span className="text-sm font-semibold font-ibm-mono text-gray-700 flex items-center gap-1">
          <ThunderboltOutlined className="text-amber-500" />
          Retrain Model
        </span>
        {statusTag()}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500">
          {feedbackCount}/{retrainThreshold} feedbacks
        </span>
        <Tooltip title="Auto-retrain fires at 100%">
          <Progress
            percent={progressPercent}
            size="small"
            status={progressPercent >= 100 ? "success" : "active"}
            className="flex-1"
            showInfo={false}
          />
        </Tooltip>
        <span className="text-xs text-gray-400">{progressPercent}%</span>
      </div>
      <Button
        icon={<ReloadOutlined />}
        size="small"
        loading={retrainLoading}
        disabled={retrainLoading || selectedDatasetId === null || modelFamilyName === null}
        onClick={handleManualRetrain}
        className="w-full"
      >
        Retrain Now
      </Button>
      {lastRetrainJob?.result_metrics?.accuracy !== undefined && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Last accuracy:{" "}
          {((lastRetrainJob.result_metrics.accuracy as number) * 100).toFixed(
            1,
          )}
          %
        </p>
      )}
    </div>
  );
};
