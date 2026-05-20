import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../../redux/features/datasetSlice";
import {
  loadLastAnnotateDatasetId,
  persistLastAnnotateDatasetId,
} from "../../utils/annotateLastDataset";
import type { User } from "../../types";

/**
 * Load datasets for the hub (same rules as Dashboard), remember last dataset per user,
 * and default the URL: valid last visit, else the only dataset when exactly one exists.
 */
export function useHubDatasets(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof import("react-router-dom").useSearchParams>[1],
  user: User | null,
) {
  const dispatch = useAppDispatch();
  const { allDatasets } = useAppSelector((s) => s.dataset);
  const datasetIdParam = searchParams.get("dataset_id");

  /** Hub-scoped list load status (fetchAllDatasets does not toggle Redux `loading`). */
  const [hubDatasetListStatus, setHubDatasetListStatus] = useState<
    "idle" | "loading" | "ready"
  >("idle");

  useEffect(() => {
    if (!user) {
      setHubDatasetListStatus("idle");
      return;
    }
    if (user.role === "admin" || user.role === "user") {
      setHubDatasetListStatus("loading");
      void dispatch(fetchAllDatasets()).finally(() => setHubDatasetListStatus("ready"));
    } else if (user.role === "team_owner") {
      setHubDatasetListStatus("loading");
      void dispatch(fetchAllTeamDatasets()).finally(() => setHubDatasetListStatus("ready"));
    } else {
      setHubDatasetListStatus("ready");
    }
  }, [user?.id, user?.role, dispatch]);

  useEffect(() => {
    if (searchParams.get("dataset_id")) return;
    const uid = user?.id;
    if (uid == null || !Number.isFinite(uid)) return;
    if (allDatasets.length === 0) return;

    const last = loadLastAnnotateDatasetId(uid);
    const lastOk = last != null && allDatasets.some((d) => d.id === last);
    /** Teams often have a single dataset — select it when there is nothing else to choose. */
    const pickId = lastOk ? last : allDatasets.length === 1 ? allDatasets[0].id : null;
    if (pickId == null) return;

    const next = new URLSearchParams(searchParams);
    next.set("dataset_id", String(pickId));
    if (!next.get("mode")) next.set("mode", "random");
    setSearchParams(next, { replace: true });
  }, [searchParams, allDatasets, user?.id, setSearchParams]);

  useEffect(() => {
    const uid = user?.id;
    if (uid == null || !Number.isFinite(uid)) return;
    const raw = searchParams.get("dataset_id");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    persistLastAnnotateDatasetId(uid, id);
  }, [searchParams, user?.id]);

  /**
   * True while we are about to set `dataset_id` (last visit, or sole accessible dataset).
   * Avoids flashing "pick a dataset" until the list has loaded and `setSearchParams` has run.
   */
  const awaitingHubDatasetBootstrap = useMemo(() => {
    if (!user || datasetIdParam) return false;
    const uid = user.id;
    if (!Number.isFinite(uid)) return false;
    if (hubDatasetListStatus !== "ready") return true;
    const last = loadLastAnnotateDatasetId(uid);
    const lastOk = last != null && allDatasets.some((d) => d.id === last);
    const soleDataset = allDatasets.length === 1;
    return lastOk || soleDataset;
  }, [user?.id, datasetIdParam, hubDatasetListStatus, allDatasets]);

  return { allDatasets, awaitingHubDatasetBootstrap };
}
