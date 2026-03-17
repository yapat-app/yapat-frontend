/**
 * useAutoRetrain
 * Watches feedbackCount and fires retrain at threshold.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { triggerRetrain, runInference } from "../redux/features/alSlice";

export const useAutoRetrain = () => {
  const dispatch = useAppDispatch();
  const {
    feedbackCount,
    retrainThreshold,
    modelCheckpointId,
    snippetSetId,
    inferenceK,
    retrainLoading,
  } = useAppSelector((state) => state.al);

  const lastTriggeredAt = useRef<number>(0);

  useEffect(() => {
    if (
      feedbackCount >= retrainThreshold &&
      feedbackCount > lastTriggeredAt.current &&
      modelCheckpointId !== null &&
      snippetSetId !== null &&
      !retrainLoading
    ) {
      lastTriggeredAt.current = feedbackCount;
      dispatch(
        triggerRetrain({ model_checkpoint_id: modelCheckpointId }),
      ).then((result) => {
        if (triggerRetrain.fulfilled.match(result) && snippetSetId !== null) {
          // After retrain, re-run inference with the (possibly new) checkpoint
          const newCheckpointId =
            result.payload.new_checkpoint_id ?? modelCheckpointId;
          dispatch(
            runInference({
              model_checkpoint_id: newCheckpointId!,
              snippet_set_id: snippetSetId,
              k: inferenceK,
            }),
          );
        }
      });
    }
  }, [feedbackCount, retrainThreshold, modelCheckpointId, snippetSetId, retrainLoading]);
};

