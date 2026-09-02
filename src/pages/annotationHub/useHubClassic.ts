import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { useAnnotationWorkflow } from "../../hooks/useAnnotationWorkflow";
import {
  annotationsToClassicFeedbacks,
  annotationRowsAlignedToSnippets,
} from "../../utils/classicFeedSync";
import {
  setClassicAnnotationFeed,
  hydrateClassicFeedbacks,
  hydrateClassicAnnotations,
  hydrateAlSnippetLabels,
  clearClassicAnnotationFeed,
} from "../../redux/features/alSlice";
import {
  fetchSnippetFeed,
  fetchSimilaritySnippetFeed,
  loadSnippets,
  saveClassicFeedSlot,
  restoreClassicFeedSlot,
  ensureClassicFeedCacheHydrated,
} from "../../redux/features/snippetSlice";
import { getFeedHistory } from "../../redux/features/feedSlice";
import { getAllDatasetEmbeddings } from "../../redux/features/embeddingSlice";
import { pickLatestServerClassicFeed } from "../../utils/classicFeedServerHydrate";
import type { Annotation, FeedSimilarityCreate, Snippet } from "../../types";
import type { AnnotateMode } from "./types";
import { fetchAnnotationsBySnippetIds } from "../../utils/batchFetchAnnotationsBySnippetIds";
import { datasetApi, snippetApi } from "../../services/api";
import { alApi } from "../../services/alApi";

export function useHubClassic(
  mode: AnnotateMode,
  classicDatasetId: string | null,
  userId: number | null,
) {
  const dispatch = useAppDispatch();
  const prevClassicRef = useRef<{ datasetId: string; mode: "random" | "similarity" | "filter" } | null>(
    null,
  );
  const serverHydrateTriedRef = useRef<string | null>(null);

  const [classicConfigOpen, setClassicConfigOpen] = useState(false);
  const [feedGenerateBusy, setFeedGenerateBusy] = useState(false);
  const [serverHydrateBusy, setServerHydrateBusy] = useState(false);
  const [classicBootstrapResolved, setClassicBootstrapResolved] = useState(false);
  const [feedLimit, setFeedLimit] = useState(50);
  const [filterAnnotationStatus, setFilterAnnotationStatus] = useState<"any" | "annotated" | "unannotated">("any");
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [recordingLocations, setRecordingLocations] = useState<string[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [filterSpecies, setFilterSpecies] = useState<string[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<string[]>([]);
  const [speciesLoading, setSpeciesLoading] = useState(false);

  // ── Standalone "search snippets by ID" tool ──────────────────────────────
  const [snippetSearchOpen, setSnippetSearchOpen] = useState(false);
  const [snippetSearchResultIds, setSnippetSearchResultIds] = useState<number[]>([]);
  const [snippetSearchSelectedIds, setSnippetSearchSelectedIds] = useState<number[]>([]);
  const [snippetSearchLoading, setSnippetSearchLoading] = useState(false);
  const [snippetSearchApplying, setSnippetSearchApplying] = useState(false);
  // True while the feed is showing search results (not the generated feed).
  const [searchActive, setSearchActive] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  // The snippet IDs currently APPLIED to the feed (source of truth for what the
  // modal seeds from on reopen — not the `snippets` variable, which tracks a
  // different feed source and can be stale).
  const [appliedSearchIds, setAppliedSearchIds] = useState<number[]>([]);
  // Snapshot of the feed that was on screen right before entering search mode,
  // so the "exit search" (×) button can restore it.
  const preSearchFeedRef = useRef<Snippet[]>([]);
  // Accumulates every snippet fetched during a search session, so a selected
  // snippet's full object is available at Apply even if the query has changed
  // since it was picked.
  const snippetSearchCacheRef = useRef<Map<number, Snippet>>(new Map());
  const snippetSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snippetSearchSeq = useRef(0);
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

  const isClassicMode = mode === "random" || mode === "similarity" || mode === "filter";

  useEffect(() => {
    if (!isClassicMode) {
      setClassicBootstrapResolved(true);
      return;
    }
    setClassicBootstrapResolved(false);
    serverHydrateTriedRef.current = null;
  }, [mode, classicDatasetId, isClassicMode]);

  useEffect(() => {
    if (!isClassicMode) {
      prevClassicRef.current = null;
      return;
    }
    if (!classicDatasetId) {
      prevClassicRef.current = null;
      setClassicBootstrapResolved(true);
      return;
    }
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    const prev = prevClassicRef.current;
    if (prev) {
      const prevDs = Number(prev.datasetId);
      const datasetChanged = prev.datasetId !== classicDatasetId;
      // NOTE: do NOT save on mode change here. setMode (AnnotationHub) already saves
      // the outgoing slot synchronously BEFORE swapping the feed. By the time this
      // post-render effect runs on a mode change, state.snippets has already been
      // replaced with the new mode's feed — saving here would clobber the previous
      // mode's slot with the wrong feed. Only handle dataset changes here.
      if (!Number.isNaN(prevDs) && datasetChanged) {
        dispatch(saveClassicFeedSlot({ datasetId: prevDs, kind: prev.mode }));
      }
    }

    prevClassicRef.current = { datasetId: classicDatasetId, mode };
  }, [mode, classicDatasetId, userId, dispatch, isClassicMode]);

  /** Restore last random/similarity slot from localStorage before paint (avoids empty-state flash). */
  useLayoutEffect(() => {
    if (!isClassicMode || !classicDatasetId || userId == null) return;
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    dispatch(ensureClassicFeedCacheHydrated(userId));
    dispatch(restoreClassicFeedSlot({ datasetId: ds, kind: mode }));
  }, [isClassicMode, mode, classicDatasetId, userId, dispatch]);

  const { snippets } = useAnnotationWorkflow({
    datasetId: classicDatasetId,
    enabled: isClassicMode,
    skipFeedHistoryAutoLoad: true,
    annotateHubClassic: isClassicMode,
  });

  const classicSnippetIdsKey = useMemo(
    () => snippets.map((s) => s.id).join(","),
    [snippets],
  );

  useEffect(() => {
    if (!isClassicMode || !classicDatasetId) return;
    if (snippets.length > 0) {
      setClassicBootstrapResolved(true);
    }
  }, [isClassicMode, classicDatasetId, snippets.length]);

  useEffect(() => {
    if (!isClassicMode) return;
    if (!classicDatasetId || userId == null) return;
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    if (snippets.length > 0) {
      setClassicBootstrapResolved(true);
      return;
    }

    const tryKey = `${userId}-${classicDatasetId}-${mode}`;
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
        setServerHydrateBusy(false);
        if (!cancelled) {
          setClassicBootstrapResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      setServerHydrateBusy(false);
    };
  }, [isClassicMode, mode, classicDatasetId, userId, snippets.length, dispatch]);

  useEffect(() => {
    if (!isClassicMode || !classicDatasetId) return;
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
        const bySnippet: Record<number, Annotation[]> = {};
        snippets.forEach((s, i) => {
          const rows = aligned[i] ?? [];
          if (rows.length > 0) bySnippet[s.id] = rows;
        });
        dispatch(
          hydrateClassicFeedbacks(
            annotationsToClassicFeedbacks(snippets, aligned),
          ),
        );
        dispatch(hydrateClassicAnnotations(bySnippet));
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isClassicMode, classicDatasetId, classicSnippetIdsKey, dispatch, snippets]);

  useEffect(() => {
    if (!classicDatasetId || !isClassicMode) return;
    dispatch(getAllDatasetEmbeddings(Number(classicDatasetId)));
  }, [classicDatasetId, isClassicMode, dispatch]);

  useEffect(() => {
    if (mode !== "filter" || !classicDatasetId) {
      setRecordingLocations([]);
      return;
    }
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    let cancelled = false;
    setLocationsLoading(true);
    void datasetApi
      .getRecordingLocations(ds)
      .then((res) => {
        if (!cancelled) setRecordingLocations(res.locations ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecordingLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, classicDatasetId]);

  useEffect(() => {
    if (mode !== "filter" || !classicDatasetId) {
      setSpeciesOptions([]);
      dispatch(hydrateAlSnippetLabels({}));
      return;
    }
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    let cancelled = false;
    setSpeciesLoading(true);
    void alApi
      .getSnippetLabels(ds)
      .then((res) => {
        if (cancelled) return;
        const distinct = new Set<string>();
        const bySnippet: Record<number, string[]> = {};
        res.items.forEach((item) => {
          item.labels.forEach((label) => distinct.add(label));
          bySnippet[item.snippet_id] = item.labels;
        });
        setSpeciesOptions(Array.from(distinct).sort());
        dispatch(hydrateAlSnippetLabels(bySnippet));
      })
      .catch(() => {
        if (!cancelled) {
          setSpeciesOptions([]);
          dispatch(hydrateAlSnippetLabels({}));
        }
      })
      .finally(() => {
        if (!cancelled) setSpeciesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, classicDatasetId, dispatch]);

  // The Species picker only renders (in ClassicFeedConfigModal) when
  // filterAnnotationStatus === "annotated" -- clear any stale selection
  // when status moves away from "annotated" so a hidden filter never rides
  // along silently in the feed request.
  useEffect(() => {
    if (filterAnnotationStatus !== "annotated" && filterSpecies.length > 0) {
      setFilterSpecies([]);
    }
  }, [filterAnnotationStatus, filterSpecies]);

  // Leaving the current dataset/mode invalidates the search view + selection.
  useEffect(() => {
    setSearchActive(false);
    setSearchCount(0);
    preSearchFeedRef.current = [];
    snippetSearchCacheRef.current = new Map();
    setSnippetSearchSelectedIds([]);
    setSnippetSearchResultIds([]);
    setAppliedSearchIds([]);
  }, [classicDatasetId, mode]);

  const openSnippetSearch = useCallback(() => {
    // Seed the editor from the currently-APPLIED ids so modifying shows exactly
    // what's on the feed, and Cancel discards in-modal edits (a draft the user
    // empties but doesn't apply is dropped on reopen). When nothing is applied
    // yet, start empty. The applied set only clears on exit (×), feed
    // generation, or dataset/mode change.
    setSnippetSearchSelectedIds(searchActive ? appliedSearchIds : []);
    setSnippetSearchResultIds([]);
    setSnippetSearchLoading(false);
    setSnippetSearchOpen(true);
  }, [searchActive, appliedSearchIds]);

  const closeSnippetSearch = useCallback(() => {
    if (snippetSearchTimer.current) clearTimeout(snippetSearchTimer.current);
    setSnippetSearchOpen(false);
  }, []);

  // Debounced search of the dataset's snippets by (partial) ID. Returns full
  // Snippet objects; we cache them so Apply can build the feed without refetch.
  const handleSnippetSearch = useCallback(
    (rawQuery: string) => {
      const query = rawQuery.trim();
      if (snippetSearchTimer.current) clearTimeout(snippetSearchTimer.current);
      const dsId = Number(classicDatasetId);
      if (!classicDatasetId || Number.isNaN(dsId)) {
        setSnippetSearchResultIds([]);
        return;
      }
      setSnippetSearchLoading(true);
      const seq = ++snippetSearchSeq.current;
      snippetSearchTimer.current = setTimeout(async () => {
        try {
          const rows = await snippetApi.searchBySnippetId({
            dataset_id: dsId,
            ...(query ? { q: query } : {}),
            limit: 50,
          });
          if (seq !== snippetSearchSeq.current) return; // stale response
          for (const s of rows) snippetSearchCacheRef.current.set(s.id, s);
          setSnippetSearchResultIds(rows.map((s) => s.id));
        } catch {
          if (seq === snippetSearchSeq.current) setSnippetSearchResultIds([]);
        } finally {
          if (seq === snippetSearchSeq.current) setSnippetSearchLoading(false);
        }
      }, 300);
    },
    [classicDatasetId],
  );

  // Replace the current feed with exactly the selected snippets (selection
  // order). Transient: not saved to a feed slot / server snapshot.
  const applySnippetSearch = useCallback(() => {
    const dsId = Number(classicDatasetId);
    if (!classicDatasetId || Number.isNaN(dsId)) return;
    const selected = snippetSearchSelectedIds
      .map((id) => snippetSearchCacheRef.current.get(id))
      .filter((s): s is Snippet => Boolean(s));
    if (selected.length === 0) {
      message.warning("No snippets selected.");
      return;
    }
    setSnippetSearchApplying(true);
    try {
      // Snapshot the feed we're replacing — but only when entering search mode,
      // so re-searching while already viewing results still restores the
      // ORIGINAL pre-search feed.
      if (!searchActive) preSearchFeedRef.current = snippets;
      dispatch(setClassicAnnotationFeed({ snippets: selected, datasetId: dsId }));
      setSearchActive(true);
      setSearchCount(selected.length);
      setAppliedSearchIds(selected.map((s) => s.id));
      setSnippetSearchOpen(false);
      message.success(
        `Feed set to ${selected.length} selected snippet${selected.length === 1 ? "" : "s"}`,
      );
    } finally {
      setSnippetSearchApplying(false);
    }
  }, [classicDatasetId, snippetSearchSelectedIds, dispatch, searchActive, snippets]);

  // Leave search mode: restore the feed that was showing before the search.
  const exitSnippetSearch = useCallback(() => {
    const dsId = Number(classicDatasetId);
    if (!Number.isNaN(dsId)) {
      dispatch(
        setClassicAnnotationFeed({
          snippets: preSearchFeedRef.current,
          datasetId: dsId,
        }),
      );
    }
    preSearchFeedRef.current = [];
    setSearchActive(false);
    setSearchCount(0);
    // Exiting is the point where the working selection is discarded.
    snippetSearchCacheRef.current = new Map();
    setSnippetSearchSelectedIds([]);
    setSnippetSearchResultIds([]);
    setAppliedSearchIds([]);
  }, [classicDatasetId, dispatch]);

  const { snippetsLoading, snippets: snippetList, error: snippetError } =
    useAppSelector((s) => s.snippet);
  const hasClassicFeed = snippetList.length > 0;

  const classicCanGenerate =
    mode === "similarity"
      ? !!classicDatasetId && !!similarityState.audioFile
      : !!classicDatasetId; // random and filter only need a dataset

  const handleGenerateFeed = useCallback(async () => {
    if (!classicDatasetId) return;
    const dsId = Number(classicDatasetId);
    if (Number.isNaN(dsId)) return;

    setFeedGenerateBusy(true);
    try {
      let rows: Snippet[] = [];

      if (mode === "random") {
        rows = await dispatch(
          fetchSnippetFeed({ dataset_id: dsId, limit: feedLimit, method: "random" }),
        ).unwrap();
      } else if (mode === "filter") {
        rows = await dispatch(
          fetchSnippetFeed({
            dataset_id: dsId,
            limit: feedLimit,
            method: "filter",
            annotation_status: filterAnnotationStatus,
            ...(filterLocations.length > 0 ? { location: filterLocations.join(",") } : {}),
            ...(filterSpecies.length > 0 ? { species: filterSpecies.join(",") } : {}),
          }),
        ).unwrap();
      } else {
        const { audioFile, startSec, endSec } = similarityState;
        if (!audioFile) {
          message.warning("Upload a reference audio file to generate a similarity feed.");
          return;
        }
        const payload: FeedSimilarityCreate = {
          audio_file: audioFile,
          dataset_id: dsId,
          start_time: startSec,
          end_time: endSec,
          limit: feedLimit,
        };
        rows = await dispatch(fetchSimilaritySnippetFeed(payload)).unwrap();
      }

      const count = rows.length;

      dispatch(
        saveClassicFeedSlot({
          datasetId: dsId,
          kind: mode as "random" | "similarity" | "filter",
        }),
      );

      if (count === 0) {
        message.warning("No snippets returned for this feed. Try another dataset or limit.");
        dispatch(clearClassicAnnotationFeed());
        return;
      }

      dispatch(setClassicAnnotationFeed({ snippets: rows, datasetId: dsId }));
      // A freshly generated feed replaces any search view + working selection.
      setSearchActive(false);
      setSearchCount(0);
      preSearchFeedRef.current = [];
      snippetSearchCacheRef.current = new Map();
      setSnippetSearchSelectedIds([]);
      setSnippetSearchResultIds([]);
      setAppliedSearchIds([]);

      setClassicConfigOpen(false);
      message.success(
        hasClassicFeed
          ? `New feed ready — ${count} snippet${count === 1 ? "" : "s"}`
          : `Feed generated — ${count} snippet${count === 1 ? "" : "s"}`,
      );
    } catch (err) {
      const detail =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : snippetError ?? "Failed to generate feed";
      message.error(detail);
    } finally {
      setFeedGenerateBusy(false);
    }
  }, [
    classicDatasetId,
    mode,
    feedLimit,
    filterAnnotationStatus,
    filterLocations,
    filterSpecies,
    similarityState,
    dispatch,
    hasClassicFeed,
    snippetError,
  ]);

  const awaitingClassicFeedBootstrap =
    isClassicMode &&
    !!classicDatasetId &&
    snippets.length === 0 &&
    !classicBootstrapResolved;

  /** Full-page spinner only when there is no feed yet (not while regenerating). */
  const showClassicSpinner =
    awaitingClassicFeedBootstrap ||
    (isClassicMode && snippetsLoading && snippets.length === 0);
  const showClassicEmpty =
    isClassicMode &&
    (!classicDatasetId ||
      (snippets.length === 0 &&
        classicBootstrapResolved &&
        !snippetsLoading &&
        !serverHydrateBusy));
  const generateFeedLabel = hasClassicFeed ? "Edit Feed" : "Generate Feed";

  return {
    snippets,
    classicConfigOpen,
    setClassicConfigOpen,
    serverHydrateBusy,
    feedLimit,
    setFeedLimit,
    filterAnnotationStatus,
    setFilterAnnotationStatus,
    filterLocations,
    setFilterLocations,
    recordingLocations,
    locationsLoading,
    filterSpecies,
    setFilterSpecies,
    speciesOptions,
    speciesLoading,
    // Snippet search tool
    snippetSearchOpen,
    openSnippetSearch,
    closeSnippetSearch,
    snippetSearchResultIds,
    snippetSearchSelectedIds,
    setSnippetSearchSelectedIds,
    snippetSearchLoading,
    snippetSearchApplying,
    onSnippetSearch: handleSnippetSearch,
    applySnippetSearch,
    searchActive,
    searchCount,
    exitSnippetSearch,
    feedGenerateBusy,
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
