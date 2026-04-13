/**
 * useAutoRetrain
 * Watches feedbackCount and fires retrain at threshold.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { triggerRetrain, runInference, pollRetrainJob } from "../redux/features/alSlice";

export const useAutoRetrain = () => {
  const dispatch = useAppDispatch();
  const {
    feedbackCount,
    retrainThreshold,
    modelCheckpointId,
    modelFamilyName,
    snippetSetId,
    inferenceK,
    retrainLoading,
    selectedDatasetId,
  } = useAppSelector((state) => state.al);

  const lastTriggeredAt = useRef<number>(0);

  useEffect(() => {
    if (
      feedbackCount >= retrainThreshold &&
      feedbackCount > lastTriggeredAt.current &&
      selectedDatasetId !== null &&
      modelFamilyName !== null &&
      snippetSetId !== null &&
      !retrainLoading
    ) {
      lastTriggeredAt.current = feedbackCount;
      dispatch(triggerRetrain({ dataset_id: selectedDatasetId, model_family_name: modelFamilyName })).then(
        (result) => {
          if (!triggerRetrain.fulfilled.match(result) || snippetSetId === null) return;
          const jobId = result.payload.job_id;

          // Poll until completion, then force-refresh inference.
          const poll = async () => {
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

          void poll();
        },
      );
    }
  }, [
    feedbackCount,
    retrainThreshold,
    selectedDatasetId,
    modelFamilyName,
    modelCheckpointId,
    snippetSetId,
    retrainLoading,
  ]);
};

