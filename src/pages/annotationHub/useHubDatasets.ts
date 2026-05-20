import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../../redux/features/datasetSlice";
import {
  loadLastAnnotateDatasetId,
  persistLastAnnotateDatasetId,
} from "../../utils/annotateLastDataset";
import type { User } from "../../types";

/**
 * Load datasets for the hub (same rules as Dashboard) and remember / restore last dataset in the URL.
 */
export function useHubDatasets(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof import("react-router-dom").useSearchParams>[1],
  user: User | null,
) {
  const dispatch = useAppDispatch();
  const { allDatasets } = useAppSelector((s) => s.dataset);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "user") {
      dispatch(fetchAllDatasets());
    } else if (user.role === "team_owner") {
      dispatch(fetchAllTeamDatasets());
    }
  }, [user, dispatch]);

  useEffect(() => {
    if (searchParams.get("dataset_id")) return;
    const uid = user?.id;
    if (uid == null || !Number.isFinite(uid)) return;
    if (allDatasets.length === 0) return;

    const last = loadLastAnnotateDatasetId(uid);
    if (last == null || !allDatasets.some((d) => d.id === last)) return;

    const next = new URLSearchParams(searchParams);
    next.set("dataset_id", String(last));
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

  return { allDatasets };
}
