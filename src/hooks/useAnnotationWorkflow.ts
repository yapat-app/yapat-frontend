/**
 * Custom Hook for Annotation Workflow
 *
 * Manages data fetching and state management for the annotation workflow
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  moveToNextSnippet,
  moveToPreviousSnippet,
  markCurrentAsAnnotated,
  loadSnippets,
} from "../redux/features/snippetSlice";
import { fetchAnnotations } from "../redux/features/annotationSlice";
import { fetchAnnotationsBySnippetIds } from "../utils/batchFetchAnnotationsBySnippetIds";
import { message } from "antd";
import { useSearchParams } from "react-router-dom";
import { clearEmbedding } from "../redux/features/embeddingSlice";
import { getFeedHistory } from "../redux/features/feedSlice";

interface UseAnnotationWorkflowParams {
  datasetId: string | null;
  limit?: number;
  enabled?: boolean;
  /** When true, do not auto-load the latest item from feed history (AnnotationHub per-mode slots). */
  skipFeedHistoryAutoLoad?: boolean;
}

export const useAnnotationWorkflow = ({
  enabled = true,
  skipFeedHistoryAutoLoad = false,
}: UseAnnotationWorkflowParams) => {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const datasetId = searchParams.get("dataset_id");
  const {
    snippets,
    currentSnippet,
    currentIndex,
    loading,
    selectedFeedId,
    error,
    snippetsFetched,
  } = useAppSelector((state) => state.snippet);

  const { annotations } = useAppSelector((state) => state.annotation);
  const { feedHistory } = useAppSelector((state) => state.feed);

  // Track which snippets have annotations (Set of snippet IDs)
  const [snippetsWithAnnotations, setSnippetsWithAnnotations] = useState<
    Set<number>
  >(new Set());

  //Load snippets feed on mount

  // useEffect(() => {
  //get default feed if it's already not generated with the datasetId and limit:50
  // if (snippets.length === 0) {
  //   if (datasetId) {
  //     dispatch(fetchSnippetFeed({ dataset_id: parseInt(datasetId), limit }));
  //   } else {
  //     // Load without dataset filter (all unannotated snippets)
  //     dispatch(fetchSnippetFeed({ limit }));
  //   }
  // }

  // Cleanup on unmount
  //   return () => {
  //     dispatch(clearSnippets());
  //     dispatch(clearAnnotations());
  //   };
  // }, []);

  useEffect(() => {
    if (!enabled) return;
    dispatch(clearEmbedding());
  }, [dispatch, enabled]);

  useEffect(() => {
    if (!enabled) return;
    dispatch(getFeedHistory());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (skipFeedHistoryAutoLoad) return;
    if (feedHistory && feedHistory.length > 0 && snippets.length === 0) {
      dispatch(loadSnippets(feedHistory[0]));
    }
  }, [feedHistory, enabled, skipFeedHistoryAutoLoad, snippets.length, dispatch]);

  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!snippetsFetched) return;

    const toastKey = datasetId
      ? `snippets-fetched-dataset-${datasetId}`
      : `snippets-fetched-feed-${selectedFeedId ?? "unknown"}`;

    // Avoid duplicate toasts (React StrictMode / effect re-runs).
    if (lastToastKeyRef.current === toastKey) return;
    lastToastKeyRef.current = toastKey;

    if (datasetId) {
      message.open({
        key: toastKey,
        type: "success",
        content: `${snippets.length} snippets feed generated for dataset# ${datasetId}`,
      });
      return;
    }

    message.open({
      key: toastKey,
      type: "success",
      content: `Viewing Feed #${selectedFeedId}`,
    });
  }, [snippetsFetched, datasetId, selectedFeedId, snippets.length]);

  useEffect(() => {
    if (!enabled || !currentSnippet) return;
    dispatch(fetchAnnotations({ snippet_id: currentSnippet.id }));
  }, [currentSnippet, dispatch, enabled]);

  //Memoize snippet IDs for dependency tracking
  const snippetIds = useMemo(
    () =>
      snippets
        .map((s) => s.id)
        .sort()
        .join(","),
    [snippets],
  );

  //Memoize annotation snippet IDs for dependency tracking
  const annotationSnippetIds = useMemo(
    () =>
      annotations
        .map((a) => a.snippet_id)
        .filter((id, index, arr) => arr.indexOf(id) === index)
        .sort()
        .join(","),
    [annotations],
  );

  //Load annotations for all snippets when snippets are loaded
  //This allows us to know which snippets have annotations
  useEffect(() => {
    if (snippets.length > 0) {
      const fetchAllAnnotations = async () => {
        try {
          const ids = snippets.map((s) => s.id);
          const rows = await fetchAnnotationsBySnippetIds(ids);
          const annotatedSnippetIds = new Set<number>();
          for (const ann of rows) {
            annotatedSnippetIds.add(ann.snippet_id);
          }
          setSnippetsWithAnnotations(annotatedSnippetIds);
        } catch (error) {
          // Silently fail - we'll still track annotations as we encounter them
          console.warn("Failed to fetch all annotations:", error);
        }
      };

      void fetchAllAnnotations();
    } else {
      setSnippetsWithAnnotations(new Set());
    }
  }, [snippetIds]); // Re-run when snippet IDs change

  //Update snippetsWithAnnotations when annotations change (e.g., new annotation created)
  useEffect(() => {
    if (annotations.length > 0) {
      setSnippetsWithAnnotations((prev) => {
        const updated = new Set(prev);
        annotations.forEach((ann) => {
          updated.add(ann.snippet_id);
        });
        return updated;
      });
    }
  }, [annotationSnippetIds, annotations]);

  //Get annotations for current snippet

  const currentSnippetAnnotations = annotations.filter(
    (ann) => ann.snippet_id === currentSnippet?.id,
  );

  //Count annotated snippets (snippets that have at least one annotation)
  //Use the tracked set which includes annotations from all snippets
  const annotatedCount = snippets.filter((s) =>
    snippetsWithAnnotations.has(s.id),
  ).length;

  //Calculate progress percentage based on annotated count, not position
  const progressPercent =
    snippets.length > 0
      ? Math.round((annotatedCount / snippets.length) * 100)
      : 0;

  //Handle successful annotation creation

  const handleAnnotationSuccess = () => {
    // Mark current snippet as annotated
    dispatch(markCurrentAsAnnotated());

    // Update tracked set to include current snippet
    if (currentSnippet) {
      setSnippetsWithAnnotations((prev) => {
        const updated = new Set(prev);
        updated.add(currentSnippet.id);
        return updated;
      });
    }

    // Note: We don't automatically move to next snippet - user can navigate manually
  };

  /**
   * Handle previous snippet
   */
  const handlePrevious = () => {
    dispatch(moveToPreviousSnippet());
  };

  //Handle next snippet

  const handleNext = () => {
    dispatch(moveToNextSnippet());
  };

  return {
    snippets,
    currentSnippet,
    currentIndex,
    loading,
    error,
    annotations: currentSnippetAnnotations,
    annotatedCount,
    progressPercent,
    handleAnnotationSuccess,
    handlePrevious,
    handleNext,
    canGoPrevious: currentIndex > 0,
    canGoNext: currentIndex < snippets.length - 1,
  };
};
