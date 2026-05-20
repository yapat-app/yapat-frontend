import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { useAnnotationWorkflow } from "../../hooks/useAnnotationWorkflow";
import {
  annotationsToClassicFeedbacks,
  annotationRowsAlignedToSnippets,
} from "../../utils/classicFeedSync";
import {
  setClassicAnnotationFeed,
  hydrateClassicFeedbacks,
  clearClassicAnnotationFeed,
} from "../../redux/features/alSlice";
import {
  fetchSnippetFeed,
  fetchSimilaritySnippetFeed,
  loadSnippets,
  saveClassicFeedSlot,
  restoreClassicFeedSlot,
} from "../../redux/features/snippetSlice";
import { getFeedHistory } from "../../redux/features/feedSlice";
import { getAllDatasetEmbeddings } from "../../redux/features/embeddingSlice";
import { pickLatestServerClassicFeed } from "../../utils/classicFeedServerHydrate";
import store from "../../redux/store";
import type { FeedSimilarityCreate } from "../../types";
import type { AnnotateMode } from "./types";
import { fetchAnnotationsBySnippetIds } from "../../utils/batchFetchAnnotationsBySnippetIds";

export function useHubClassic(
  mode: AnnotateMode,
  classicDatasetId: string | null,
  classicFeedCacheUserId: number | null,
) {
  const dispatch = useAppDispatch();
  const prevClassicRef = useRef<{ datasetId: string; mode: "random" | "similarity" } | null>(
    null,
  );
  const serverHydrateTriedRef = useRef<string | null>(null);

  const [classicConfigOpen, setClassicConfigOpen] = useState(false);
  const [serverHydrateBusy, setServerHydrateBusy] = useState(false);
  const [feedLimit, setFeedLimit] = useState(50);
  const [similarityState, setSimilarityState] = useState<{
    audioFile: File | null;
    startSec: number;
    endSec: number;
  }>({ audioFile: null, startSec: 0, endSec: 3 });

  const handleSimilarityChange = useCallback(
    (value: { audioFile: File | null; startSec: number; endSec: number }) => {
      setSimilarityState(value);
    },
    [],
  );

  useEffect(() => {
    if (mode !== "random" && mode !== "similarity") {
      prevClassicRef.current = null;
      return;
    }
    if (!classicDatasetId) {
      prevClassicRef.current = null;
      return;
    }
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    const prev = prevClassicRef.current;
    if (prev) {
      const prevDs = Number(prev.datasetId);
      const datasetChanged = prev.datasetId !== classicDatasetId;
      const modeChanged = prev.mode !== mode;
      if (!Number.isNaN(prevDs) && (datasetChanged || modeChanged)) {
        dispatch(saveClassicFeedSlot({ datasetId: prevDs, kind: prev.mode }));
      }
    }

    dispatch(restoreClassicFeedSlot({ datasetId: ds, kind: mode }));
    prevClassicRef.current = { datasetId: classicDatasetId, mode };
  }, [mode, classicDatasetId, classicFeedCacheUserId, dispatch]);

  const { snippets } = useAnnotationWorkflow({
    datasetId: classicDatasetId,
    enabled: mode !== "al",
    skipFeedHistoryAutoLoad: true,
  });

  const classicSnippetIdsKey = useMemo(
    () => snippets.map((s) => s.id).join(","),
    [snippets],
  );

  useEffect(() => {
    if (mode !== "random" && mode !== "similarity") return;
    if (!classicDatasetId || classicFeedCacheUserId == null) return;
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    const snippetLen = store.getState().snippet.snippets.length;
    if (snippetLen > 0) {
      serverHydrateTriedRef.current = null;
      return;
    }

    const tryKey = `${classicFeedCacheUserId}-${classicDatasetId}-${mode}`;
    if (serverHydrateTriedRef.current === tryKey) return;

    let cancelled = false;
    setServerHydrateBusy(true);
    void (async () => {
      try {
        const result = await dispatch(
          getFeedHistory({ method: mode, dataset_id: ds }),
        );
        if (cancelled) return;
        serverHydrateTriedRef.current = tryKey;
        if (!getFeedHistory.fulfilled.match(result)) return;
        const match = pickLatestServerClassicFeed(result.payload, ds, mode);
        if (!match?.response?.length) return;
        dispatch(loadSnippets({ id: match.id, response: match.response }));
        dispatch(saveClassicFeedSlot({ datasetId: ds, kind: mode }));
      } finally {
        if (!cancelled) setServerHydrateBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, classicDatasetId, classicFeedCacheUserId, snippets.length, dispatch]);

  useEffect(() => {
    if (mode === "al" || !classicDatasetId) return;
    const datasetId = Number(classicDatasetId);
    if (Number.isNaN(datasetId)) return;

    if (snippets.length === 0) {
      dispatch(clearClassicAnnotationFeed());
      return;
    }

    dispatch(setClassicAnnotationFeed({ snippets, datasetId }));

    let cancelled = false;
    void (async () => {
      try {
        const ids = snippets.map((s) => s.id);
        const all = await fetchAnnotationsBySnippetIds(ids);
        if (cancelled) return;
        const aligned = annotationRowsAlignedToSnippets(snippets, all);
        dispatch(
          hydrateClassicFeedbacks(
            annotationsToClassicFeedbacks(snippets, aligned),
          ),
        );
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, classicDatasetId, classicSnippetIdsKey, dispatch, snippets]);

  useEffect(() => {
    if (!classicDatasetId || mode === "al") return;
    dispatch(getAllDatasetEmbeddings(Number(classicDatasetId)));
  }, [classicDatasetId, mode, dispatch]);

  const { snippetsLoading, snippets: snippetList } = useAppSelector((s) => s.snippet);
  const hasClassicFeed = snippetList.length > 0;

  useEffect(() => {
    if (snippets.length > 0 && classicConfigOpen) {
      setClassicConfigOpen(false);
    }
  }, [snippets.length, classicConfigOpen]);

  const classicCanGenerate =
    mode === "random"
      ? !!classicDatasetId
      : !!classicDatasetId && !!similarityState.audioFile;

  const handleGenerateFeed = useCallback(() => {
    if (!classicDatasetId) return;
    const dsId = Number(classicDatasetId);
    if (mode === "random") {
      dispatch(
        fetchSnippetFeed({ dataset_id: dsId, limit: feedLimit, method: "random" }),
      );
    } else {
      const { audioFile, startSec, endSec } = similarityState;
      if (!audioFile) return;
      const payload: FeedSimilarityCreate = {
        audio_file: audioFile,
        dataset_id: dsId,
        start_time: startSec,
        end_time: endSec,
        limit: feedLimit,
      };
      dispatch(fetchSimilaritySnippetFeed(payload));
    }
  }, [classicDatasetId, mode, feedLimit, similarityState, dispatch]);

  const isClassicMode = mode === "random" || mode === "similarity";
  const showClassicSpinner =
    isClassicMode &&
    !!classicDatasetId &&
    snippets.length === 0 &&
    (snippetsLoading || serverHydrateBusy);
  const showClassicEmpty =
    isClassicMode &&
    (!classicDatasetId ||
      (snippets.length === 0 && !snippetsLoading && !serverHydrateBusy));
  const generateFeedLabel = hasClassicFeed ? "Generate new feed" : "Generate feed";

  return {
    snippets,
    classicConfigOpen,
    setClassicConfigOpen,
    serverHydrateBusy,
    feedLimit,
    setFeedLimit,
    similarityState,
    handleSimilarityChange,
    snippetsLoading,
    hasClassicFeed,
    classicCanGenerate,
    handleGenerateFeed,
    isClassicMode,
    showClassicSpinner,
    showClassicEmpty,
    generateFeedLabel,
  };
}
