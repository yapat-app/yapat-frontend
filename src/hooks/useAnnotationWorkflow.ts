/**
 * Custom Hook for Annotation Workflow
 * 
 * Manages data fetching and state management for the annotation workflow
 */

import { useEffect, useState, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchSnippetFeed,
  moveToNextSnippet,
  moveToPreviousSnippet,
  markCurrentAsAnnotated,
  clearSnippets,
} from "../redux/features/snippetSlice";
import {
  fetchAnnotations,
  clearAnnotations,
} from "../redux/features/annotationSlice";
import { annotationApi } from "../services/api";

interface UseAnnotationWorkflowParams {
  datasetId: string | null;
  limit?: number;
}

export const useAnnotationWorkflow = ({
  datasetId,
  limit = 50,
}: UseAnnotationWorkflowParams) => {
  const dispatch = useAppDispatch();
  const { snippets, currentSnippet, currentIndex, loading, error } =
    useAppSelector((state) => state.snippet);
  const { annotations } = useAppSelector((state) => state.annotation);
  
  // Track which snippets have annotations (Set of snippet IDs)
  const [snippetsWithAnnotations, setSnippetsWithAnnotations] = useState<Set<number>>(new Set());

  //Load snippets feed on mount

  useEffect(() => {
    if (datasetId) {
      dispatch(
        fetchSnippetFeed({ dataset_id: parseInt(datasetId), limit })
      );
    } else {
      // Load without dataset filter (all unannotated snippets)
      dispatch(fetchSnippetFeed({ limit }));
    }

    // Cleanup on unmount
    return () => {
      dispatch(clearSnippets());
      dispatch(clearAnnotations());
    };
  }, [dispatch, datasetId, limit]);

  //Load annotations for current snippet
  useEffect(() => {
    if (currentSnippet) {
      dispatch(fetchAnnotations({ snippet_id: currentSnippet.id }));
    }
  }, [currentSnippet, dispatch]);

  //Memoize snippet IDs for dependency tracking
  const snippetIds = useMemo(() => snippets.map(s => s.id).sort().join(','), [snippets]);
  
  //Memoize annotation snippet IDs for dependency tracking
  const annotationSnippetIds = useMemo(
    () => annotations.map(a => a.snippet_id).filter((id, index, arr) => arr.indexOf(id) === index).sort().join(','),
    [annotations]
  );

  //Load annotations for all snippets when snippets are loaded
  //This allows us to know which snippets have annotations
  useEffect(() => {
    if (snippets.length > 0) {
      // Fetch annotations for all snippets to determine which are annotated
      const fetchAllAnnotations = async () => {
        try {
          const annotationPromises = snippets.map((snippet) =>
            annotationApi.getAll({ snippet_id: snippet.id }).catch(() => [])
          );
          const allAnnotationArrays = await Promise.all(annotationPromises);
          
          // Build set of snippet IDs that have annotations
          const annotatedSnippetIds = new Set<number>();
          allAnnotationArrays.forEach((anns, index) => {
            if (anns.length > 0) {
              annotatedSnippetIds.add(snippets[index].id);
            }
          });
          
          setSnippetsWithAnnotations(annotatedSnippetIds);
        } catch (error) {
          // Silently fail - we'll still track annotations as we encounter them
          console.warn("Failed to fetch all annotations:", error);
        }
      };
      
      fetchAllAnnotations();
    } else {
      setSnippetsWithAnnotations(new Set());
    }
  }, [snippetIds, snippets]); // Re-run when snippet IDs change

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
    (ann) => ann.snippet_id === currentSnippet?.id
  );

  //Count annotated snippets (snippets that have at least one annotation)
  //Use the tracked set which includes annotations from all snippets
  const annotatedCount = snippets.filter((s) =>
    snippetsWithAnnotations.has(s.id)
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

