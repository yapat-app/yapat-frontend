import { useCallback, useEffect, useRef, useState } from "react";
import {
  _fpvPointsCache,
  _fpvProjectionCache,
  fpvPointsKey,
  fpvProjectionKey,
  fpvScopeKey,
  clearFpvCache,
  projectionHasValidCoords,
  extractFpvErrorDetail,
  isProjectionNotReadyMessage,
  FPV_METHOD_FETCH_FALLBACK,
  ALL_PROJECTION_METHODS,
  type ProjectionMethod,
} from "./fpvHelpers";
import { visualisationsApi } from "../../../services/visualisationsApi";
import { embeddingApi } from "../../../services/api";
import type { FPVPointMetadata, FPVProjection2D } from "../../../types/visualisation";
import type { SnippetSet } from "../../../types";
import type { VisMode } from "../../../studyPhases";

export interface UseFpvDataResult {
  fpvPoints: FPVPointMetadata[];
  projectionsByMethod: Partial<Record<ProjectionMethod, FPVProjection2D>>;
  fpvLoading: boolean;
  fpvError: string | null;
  fpvGenerateLoading: boolean;
  loadingMethods: Set<ProjectionMethod>;
  effectiveEmbeddingModelId: number | null;
  effectiveSnippetSetId: number | null;
  handleGenerateNow: () => Promise<void>;
  resetProjectionComponentState: () => void;
}

export function useFpvData(opts: {
  selectedDatasetId: number | null;
  embeddingModelId: number | null;
  snippetSetId: number | null;
  visMode: VisMode;
  method: ProjectionMethod;
}): UseFpvDataResult {
  const { selectedDatasetId, embeddingModelId, snippetSetId, visMode, method } = opts;

  const [fpvPoints, setFpvPoints] = useState<FPVPointMetadata[]>([]);
  const [projectionsByMethod, setProjectionsByMethod] = useState<
    Partial<Record<ProjectionMethod, FPVProjection2D>>
  >({});
  const [fpvLoading, setFpvLoading] = useState(false);
  const [fpvError, setFpvError] = useState<string | null>(null);
  const [fpvGenerateLoading, setFpvGenerateLoading] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState<Set<ProjectionMethod>>(new Set());
  const [derivedEmbeddingModelId, setDerivedEmbeddingModelId] = useState<number | null>(null);
  const [derivedSnippetSetId, setDerivedSnippetSetId] = useState<number | null>(null);

  const inFlightMethodsRef = useRef<Set<ProjectionMethod>>(new Set());
  const fpvUnavailableScopeRef = useRef<string | null>(null);

  const effectiveEmbeddingModelId = embeddingModelId ?? derivedEmbeddingModelId;
  const effectiveSnippetSetId = snippetSetId ?? derivedSnippetSetId;

  // ── Embedding-model derivation ─────────────────────────────────────────────
  // Also derives the READY snippet set's own id alongside its embedding model
  // id — needed so callers can fetch snippet_id -> recording_id for the exact
  // snippet set the FPV projection was computed over (e.g. for location
  // filtering across the whole background scatter, not just the feed).

  useEffect(() => {
    let cancelled = false;
    async function deriveEmbeddingModel() {
      if (!selectedDatasetId) {
        setDerivedEmbeddingModelId(null);
        setDerivedSnippetSetId(null);
        return;
      }
      try {
        const sets: SnippetSet[] = await embeddingApi.allSnippetSets(selectedDatasetId);
        const ready = sets.find((s) => (s.status ?? "").toLowerCase() === "ready") ?? sets[0];
        if (!cancelled) {
          setDerivedEmbeddingModelId(ready?.embedding_model_id ?? null);
          setDerivedSnippetSetId(ready?.id ?? null);
        }
      } catch {
        if (!cancelled) {
          setDerivedEmbeddingModelId(null);
          setDerivedSnippetSetId(null);
        }
      }
    }
    if (!embeddingModelId) deriveEmbeddingModel();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, embeddingModelId]);

  useEffect(() => {
    fpvUnavailableScopeRef.current = null;
    setFpvError(null);
  }, [selectedDatasetId, effectiveEmbeddingModelId]);

  // ── State management helpers ───────────────────────────────────────────────

  const resetProjectionComponentState = useCallback(() => {
    setFpvPoints([]);
    setProjectionsByMethod({});
    setLoadingMethods(new Set());
    inFlightMethodsRef.current = new Set();
  }, []);

  const restoreFromCache = useCallback((dsId: number, emId: number) => {
    const pts = _fpvPointsCache.get(fpvPointsKey(dsId, emId));
    if (!pts) return false;
    setFpvPoints(pts);
    const restoredProjections: Partial<Record<ProjectionMethod, FPVProjection2D>> = {};
    for (const m of ["pca", "umap", "tsne", "isomap"] as ProjectionMethod[]) {
      const proj = _fpvProjectionCache.get(fpvProjectionKey(dsId, emId, m));
      if (proj) restoredProjections[m] = proj;
    }
    setProjectionsByMethod(restoredProjections);
    return true;
  }, []);

  const fetchProjectionMethod = useCallback(
    async (
      targetMethod: ProjectionMethod,
      options?: { background?: boolean; force?: boolean },
    ) => {
      if (!selectedDatasetId || !effectiveEmbeddingModelId) return;

      const scopeKey = fpvScopeKey(selectedDatasetId, effectiveEmbeddingModelId);
      if (!options?.force && fpvUnavailableScopeRef.current === scopeKey) {
        return;
      }

      const projKey = fpvProjectionKey(selectedDatasetId, effectiveEmbeddingModelId, targetMethod);
      const cachedProj = _fpvProjectionCache.get(projKey);
      if (cachedProj) {
        const pts = _fpvPointsCache.get(fpvPointsKey(selectedDatasetId, effectiveEmbeddingModelId));
        if (pts) {
          setFpvPoints(pts);
          setProjectionsByMethod((prev) =>
            prev[targetMethod] ? prev : { ...prev, [targetMethod]: cachedProj },
          );
          return;
        }
      }

      if (inFlightMethodsRef.current.has(targetMethod)) return;
      inFlightMethodsRef.current.add(targetMethod);
      setLoadingMethods((prev) => new Set(prev).add(targetMethod));
      if (!options?.background) {
        setFpvLoading(true);
        if (!options?.force) {
          setFpvError(null);
        }
      }

      try {
        const methodsToTry: ProjectionMethod[] =
          targetMethod === FPV_METHOD_FETCH_FALLBACK
            ? [targetMethod]
            : [targetMethod, FPV_METHOD_FETCH_FALLBACK];

        let loaded = false;
        for (const fetchMethod of methodsToTry) {
          const fpv = await visualisationsApi.getFPVDataset({
            dataset_id: selectedDatasetId,
            embedding_model_id: effectiveEmbeddingModelId,
            run_3d: false,
            method: fetchMethod,
          });
          const proj = fpv.projections_2d[fetchMethod];
          if (!projectionHasValidCoords(proj) || fpv.points.length === 0) {
            continue;
          }
          fpvUnavailableScopeRef.current = null;
          _fpvPointsCache.set(
            fpvPointsKey(selectedDatasetId, effectiveEmbeddingModelId),
            fpv.points,
          );
          _fpvProjectionCache.set(projKey, proj);
          setFpvPoints(fpv.points);
          setProjectionsByMethod((prev) =>
            prev[targetMethod] ? prev : { ...prev, [targetMethod]: proj },
          );
          if (!options?.background) {
            setFpvError(null);
          }
          loaded = true;
          break;
        }
        if (!loaded && !options?.background) {
          setFpvError(
            `No valid ${targetMethod} projection coordinates; try PCA or regenerate FPV.`,
          );
        }
      } catch (e: unknown) {
        const detail = extractFpvErrorDetail(e);
        if (isProjectionNotReadyMessage(detail)) {
          fpvUnavailableScopeRef.current = scopeKey;
          if (!options?.background) {
            setFpvError(detail);
          }
        } else if (!options?.background) {
          resetProjectionComponentState();
          setFpvError(detail);
        }
      } finally {
        inFlightMethodsRef.current.delete(targetMethod);
        setLoadingMethods((prev) => {
          const next = new Set(prev);
          next.delete(targetMethod);
          return next;
        });
        if (!options?.background) {
          setFpvLoading(false);
        }
      }
    },
    [selectedDatasetId, effectiveEmbeddingModelId, resetProjectionComponentState],
  );

  // ── FPV load effects ───────────────────────────────────────────────────────

  useEffect(() => {
    if (visMode === "hidden") {
      resetProjectionComponentState();
      setFpvError(null);
      return;
    }
    if (!selectedDatasetId || !effectiveEmbeddingModelId) return;

    const scopeKey = fpvScopeKey(selectedDatasetId, effectiveEmbeddingModelId);
    if (fpvUnavailableScopeRef.current === scopeKey) return;

    const alreadyCached = restoreFromCache(selectedDatasetId, effectiveEmbeddingModelId);
    if (alreadyCached) {
      fpvUnavailableScopeRef.current = null;
      return;
    }
    resetProjectionComponentState();
    void fetchProjectionMethod(method);
  }, [
    selectedDatasetId,
    effectiveEmbeddingModelId,
    visMode,
    method,
    resetProjectionComponentState,
    restoreFromCache,
    fetchProjectionMethod,
  ]);

  useEffect(() => {
    if (visMode === "hidden" || !selectedDatasetId || !effectiveEmbeddingModelId) return;
    const scopeKey = fpvScopeKey(selectedDatasetId, effectiveEmbeddingModelId);
    if (fpvUnavailableScopeRef.current === scopeKey) return;
    if (projectionsByMethod[method]) return;
    void fetchProjectionMethod(method);
  }, [
    method,
    visMode,
    selectedDatasetId,
    effectiveEmbeddingModelId,
    projectionsByMethod,
    fetchProjectionMethod,
  ]);

  useEffect(() => {
    if (visMode === "hidden" || fpvPoints.length === 0) return;
    for (const m of ALL_PROJECTION_METHODS) {
      if (m === method || projectionsByMethod[m]) continue;
      void fetchProjectionMethod(m, { background: true });
    }
  }, [
    visMode,
    fpvPoints.length,
    method,
    projectionsByMethod,
    fetchProjectionMethod,
  ]);

  // ── Generate now handler ───────────────────────────────────────────────────

  const handleGenerateNow = async () => {
    if (!selectedDatasetId || !effectiveEmbeddingModelId) return;
    setFpvGenerateLoading(true);
    setFpvError(null);
    fpvUnavailableScopeRef.current = null;
    try {
      await visualisationsApi.generateFPVDataset({
        dataset_id: selectedDatasetId,
        embedding_model_id: effectiveEmbeddingModelId,
        run_3d: false,
      });
      clearFpvCache(selectedDatasetId, effectiveEmbeddingModelId);
      resetProjectionComponentState();
      await fetchProjectionMethod(method, { force: true });
      for (const m of ALL_PROJECTION_METHODS) {
        if (m !== method) void fetchProjectionMethod(m, { background: true, force: true });
      }
    } catch (e: any) {
      resetProjectionComponentState();
      setFpvError(
        String(e?.response?.data?.detail ?? e?.message ?? "Failed to generate projection."),
      );
    } finally {
      setFpvGenerateLoading(false);
    }
  };

  return {
    fpvPoints,
    projectionsByMethod,
    fpvLoading,
    fpvError,
    fpvGenerateLoading,
    loadingMethods,
    effectiveEmbeddingModelId,
    effectiveSnippetSetId,
    handleGenerateNow,
    resetProjectionComponentState,
  };
}
