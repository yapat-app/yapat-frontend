/**
 * useAutoRetrain
 *
 * Fallback auto-trigger: fires triggerRetrain when feedbackCount reaches the
 * threshold AND the backend did not already auto-trigger (which it normally
 * does — the backend returns auto_retrain_job_id in the feedback response and
 * alSlice sets lastRetrainDispatch directly).
 *
 * This hook only matters when the backend skips auto-retrain (e.g. no snippet
 * set configured). It intentionally does NOT retry after a failed retrain.
 *
 * Polling and post-retrain inference are handled by useHubALSession's retrain-
 * polling effect (which picks up lastRetrainDispatch).
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { triggerRetrain } from "../redux/features/alSlice";

export const useAutoRetrain = () => {
  const dispatch = useAppDispatch();
  const {
    feedbackCount,
    retrainThreshold,
    modelFamilyName,
    retrainLoading,
    selectedDatasetId,
    lastRetrainDispatch,
    lastRetrainFailed,
  } = useAppSelector((state) => state.al);

  // Tracks the feedbackCount value at which we last fired triggerRetrain.
  // Reset to 0 whenever feedbackCount drops below the threshold (new cycle).
  const lastTriggeredAt = useRef<number>(0);

  useEffect(() => {
    // Reset cycle tracker when a new retrain cycle begins (count was reset).
    if (feedbackCount < retrainThreshold) {
      lastTriggeredAt.current = 0;
      return;
    }

    if (
      feedbackCount >= retrainThreshold &&
      feedbackCount > lastTriggeredAt.current &&
      selectedDatasetId !== null &&
      modelFamilyName !== null &&
      !retrainLoading &&
      !lastRetrainFailed &&       // don't auto-retry a broken model
      lastRetrainDispatch === null // backend already picked it up if non-null
    ) {
      lastTriggeredAt.current = feedbackCount;
      dispatch(triggerRetrain({ dataset_id: selectedDatasetId, model_family_name: modelFamilyName }));
    }
  }, [feedbackCount, retrainThreshold, selectedDatasetId, modelFamilyName, retrainLoading, lastRetrainFailed, lastRetrainDispatch, dispatch]);
};
