import { useEffect, useMemo, useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { getAllDatasetAnnotationStats } from "../redux/features/annotationSlice";
import { fetchAllteams } from "../redux/features/teamSlice";
import { DatasetCard } from "../components/DatasetCard";
import AddDatasetModal from "../components/AddDatasetModal";
import { clearSnippets } from "../redux/features/snippetSlice";
import type { Dataset, DatasetAnnotationStats, Team } from "../types";

type SortKey = "name" | "newest" | "snippets" | "annotated";
type TeamFilter = "all" | "none" | string;
type TypeFilter = "all" | "PAM" | "FOCAL_RECORDINGS";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A–Z)",
  newest: "Newest first",
  snippets: "Most snippets",
  annotated: "Most annotated",
};

const controlClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400";

export const Datasets = () => {
  const dispatch = useAppDispatch();
  const { snippets } = useAppSelector((state: any) => state.snippet);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  const { embeddingCreated } = useAppSelector((state) => state.embedding);
  const { allTeams } = useAppSelector((state) => state.team);
  const { datasetAnnotations } = useAppSelector((state) => state.annotation);

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");

  const canManage = user?.role === "admin" || user?.role === "team_owner";

  //clear embeddings and snippets flags
  useEffect(() => {
    if (snippets.length > 0) {
      dispatch(clearSnippets());
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (
      user.role === "admin" ||
      user.role === "user" ||
      user.role === "team_owner"
    ) {
      dispatch(fetchAllDatasets());
    }
    dispatch(getAllDatasetAnnotationStats());
  }, [user, embeddingCreated, dispatch]);

  // Team names for the filter dropdown. Admins get every team; other roles get
  // only their own, which is exactly the set they can have datasets in.
  useEffect(() => {
    if (canManage) dispatch(fetchAllteams());
  }, [canManage, dispatch]);

  // dataset_id -> stats, so the snippet/annotation sorts don't re-scan the array.
  const statsById = useMemo(() => {
    const map = new Map<number, { total: number; annotated: number }>();
    (datasetAnnotations?.datasets ?? []).forEach((s: DatasetAnnotationStats) => {
      map.set(Number(s.dataset_id), {
        total: s.total_snippets ?? 0,
        annotated: s.annotated_snippets ?? 0,
      });
    });
    return map;
  }, [datasetAnnotations]);

  const filtersActive =
    search.trim() !== "" || teamFilter !== "all" || typeFilter !== "all";

  const visibleDatasets = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const matches = (d: Dataset) => {
      // Search covers source_uri too, so "chorusrf" finds every site and
      // "part04" finds each participant's copy.
      if (needle) {
        const haystack = `${d.name ?? ""} ${d.source_uri ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (teamFilter === "none") {
        if (d.team_id != null) return false;
      } else if (teamFilter !== "all") {
        if (Number(d.team_id) !== Number(teamFilter)) return false;
      }
      if (typeFilter !== "all" && d.dataset_type !== typeFilter) return false;
      return true;
    };

    const result = (allDatasets ?? []).filter(matches);

    const statOf = (d: Dataset) =>
      statsById.get(Number(d.id)) ?? { total: 0, annotated: 0 };

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        case "snippets":
          return statOf(b).total - statOf(a).total;
        case "annotated":
          return statOf(b).annotated - statOf(a).annotated;
        case "name":
        default:
          return (a.name ?? "").localeCompare(b.name ?? "");
      }
    });
  }, [allDatasets, search, teamFilter, typeFilter, sortBy, statsById]);

  const clearFilters = () => {
    setSearch("");
    setTeamFilter("all");
    setTypeFilter("all");
  };

  const totalCount = allDatasets?.length ?? 0;
  const hasAnyDatasets = totalCount > 0;

  const toolbar = (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or path…"
          aria-label="Search datasets"
          className={`${controlClass} flex-1 min-w-[220px]`}
        />

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          aria-label="Filter by team"
          className={controlClass}
        >
          <option value="all">All teams</option>
          <option value="none">No team</option>
          {(allTeams ?? []).map((t: Team) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          aria-label="Filter by dataset type"
          className={controlClass}
        >
          <option value="all">All types</option>
          <option value="PAM">PAM</option>
          <option value="FOCAL_RECORDINGS">Focal recordings</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          aria-label="Sort datasets"
          className={controlClass}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-3 text-sm text-slate-500">
        <span>
          Showing {visibleDatasets.length} of {totalCount}
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-blue-600 hover:text-blue-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center my-8 p-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
      <svg
        className="w-16 h-16 text-gray-400 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      {hasAnyDatasets ? (
        <>
          <h3 className="card_heading_text text-gray-700 mb-2">
            No datasets match your filters
          </h3>
          <p className="text-gray-500 text-center mb-4">
            {totalCount} dataset{totalCount === 1 ? "" : "s"} available. Try a
            broader search or a different team.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Clear filters
          </button>
        </>
      ) : (
        <>
          <h3 className="card_heading_text text-gray-700 mb-2">
            No Datasets Available
          </h3>
          <p className="text-gray-500 text-center">
            {user?.role === "admin"
              ? "There are currently no datasets. Use Add Dataset to register a folder from the data volume."
              : "There are currently no datasets to display. Contact an administrator to add datasets."}
          </p>
        </>
      )}
    </div>
  );

  return (
    <div>
      <NavigationBar />
      <div className="w-full   h-full flex justify-center">
        <div className="w-[85%]">
          <div className="my-6 ">
            <h1 className="text-2xl font-bold font-ibm-mono">Datasets</h1>
            <p className="sub_description_text">
              Below you can view/ edit all datasets
            </p>
          </div>
          <div id="dataset_list">
            <div className="flex justify-between items-center">
              <h2 className="card_heading_text">Available Datasets</h2>
              {canManage && <AddDatasetModal />}
            </div>

            {canManage && hasAnyDatasets && toolbar}

            {visibleDatasets.length > 0 ? (
              <div className="flex flex-col gap-3 my-8">
                {visibleDatasets.map((dataset) => (
                  <DatasetCard key={dataset.id} dataset={dataset} />
                ))}
              </div>
            ) : (
              emptyState
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
