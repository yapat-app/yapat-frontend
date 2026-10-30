import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Drawer } from "antd";
import {
  AppstoreOutlined,
  DownOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchAllDatasets,
  fetchReferenceDatasets,
  fetchReferenceLinks,
} from "../redux/features/datasetSlice";
import { getAllDatasetAnnotationStats } from "../redux/features/annotationSlice";
import { fetchAllteams } from "../redux/features/teamSlice";
import {
  ClearFiltersLink,
  DatasetList,
} from "../components/datasets/DatasetList";
import { DatasetDetail } from "../components/datasets/DatasetDetail";
import {
  getCachedQuickLabels,
  loadQuickLabels,
} from "../components/datasets/quickLabelsCache";
import { DatasetJobsProvider } from "../components/datasets/DatasetJobsProvider";
import AddDatasetModal from "../components/AddDatasetModal";
import { clearSnippets } from "../redux/features/snippetSlice";
import type { Dataset, DatasetAnnotationStats, Team } from "../types";
import { formatDatasetCount } from "../utils/datasetStatus";

type SortKey = "name" | "newest" | "snippets" | "annotated";
// Module state: reset by a page load / reload, kept across in-app navigation.
let datasetsPageVisited = false;

type TeamFilter = "all" | "none" | string;
type TypeFilter = "all" | "PAM" | "FOCAL_RECORDINGS" | "REFERENCE";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A–Z)",
  newest: "Newest first",
  snippets: "Most snippets",
  annotated: "Most annotated",
};

const controlClass =
  "h-10 w-full appearance-none rounded-lg border px-3 text-sm " +
  "transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30";

/** Idle controls are quiet; a control that is actually filtering is highlighted. */
const ctl = (active: boolean) =>
  active
    ? "border-blue-400 bg-blue-50/60 text-blue-800 hover:border-blue-500"
    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-blue-400";

/** A <select> with a leading icon and a chevron inset from the right edge. */
const SelectBox = ({
  icon,
  children,
  className = "",
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`relative min-w-0 ${className}`}>
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
      {icon}
    </span>
    {children}
    <DownOutlined className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-400" />
  </div>
);

/**
 * The closed control is the real <select> (look and keyboard unchanged). Its
 * open list is drawn here instead of by the browser: native popups are OS
 * menus that turn dark with the browser theme, and this app is light-only.
 * Styled after the native macOS list: it opens over the control with the
 * current option aligned to it, in the system font.
 */
const OPTION_H = 26;
const LightSelect = <V extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  label: string;
  className: string;
}) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const show = () => {
    setHover(selectedIdx);
    setOpen(true);
  };
  const choose = (v: V) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="contents">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        aria-label={label}
        className={className}
        onMouseDown={(e) => {
          e.preventDefault();
          e.currentTarget.focus();
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const d = e.key === "ArrowDown" ? 1 : -1;
              setHover((h) => (h + d + options.length) % options.length);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(options[hover].value);
            } else if (e.key === "Tab") setOpen(false);
          } else if (e.key === " " || (e.altKey && e.key === "ArrowDown")) {
            e.preventDefault();
            show();
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          style={{
            top: -(selectedIdx * OPTION_H + 5),
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
          }}
          className="absolute left-0 z-50 w-max min-w-full max-w-[280px] rounded-[10px] border border-slate-300/70 bg-white p-1 text-[13px] text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setHover(i)}
              onClick={() => choose(o.value)}
              style={{ height: OPTION_H }}
              className={`flex cursor-default items-center gap-2 rounded-md pl-2 pr-4 ${
                i === hover ? "bg-blue-500 text-white" : ""
              }`}
            >
              <span className="w-4 shrink-0 text-center text-[12px]">
                {o.value === value ? "✓" : ""}
              </span>
              <span className="truncate">{o.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Datasets = () => {
  const dispatch = useAppDispatch();
  const { snippets } = useAppSelector((state: any) => state.snippet);
  const { allDatasets, referenceDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  const { embeddingCreated } = useAppSelector((state) => state.embedding);
  const { allTeams } = useAppSelector((state) => state.team);
  const { datasetAnnotations } = useAppSelector((state) => state.annotation);

  const [search, setSearchRaw] = useState("");
  const [teamFilter, setTeamFilterRaw] = useState<TeamFilter>("all");
  const [typeFilter, setTypeFilterRaw] = useState<TypeFilter>("all");
  const [sortBy, setSortByRaw] = useState<SortKey>("name");
  // True from the moment a filter or sort changes until the user picks a
  // dataset: the card then shows the first item of the list. It is set in the
  // same update as the filter, so the card never flashes the old selection.
  // The first time the page opens after a full load (open or reload) it starts
  // on the first card, whatever ?dataset= says. Coming back to it inside the app
  // (e.g. from the files page) keeps the selection in the URL.
  const [followFirst, setFollowFirst] = useState(() => !datasetsPageVisited);
  useEffect(() => {
    datasetsPageVisited = true;
  }, []);
  const setSearch = useCallback((v: string) => {
    setSearchRaw(v);
    setFollowFirst(true);
  }, []);
  const setTeamFilter = useCallback((v: TeamFilter) => {
    setTeamFilterRaw(v);
    setFollowFirst(true);
  }, []);
  const setTypeFilter = useCallback((v: TypeFilter) => {
    setTypeFilterRaw(v);
    setFollowFirst(true);
  }, []);
  const setSortBy = useCallback((v: SortKey) => {
    setSortByRaw(v);
    setFollowFirst(true);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // False until the first load has finished (the list, and for admins the
  // reference pools). Until then the page shows a quiet "Loading" line instead
  // of "No Datasets Available", and the list appears in one go instead of
  // growing as each request finishes. Already-loaded data (coming back to the
  // page) is shown at once and refreshed quietly.
  const [datasetsFetched, setDatasetsFetched] = useState(
    () => (allDatasets?.length ?? 0) > 0,
  );
  const loadsDatasets =
    user?.role === "admin" ||
    user?.role === "user" ||
    user?.role === "team_owner";

  const canManage = user?.role === "admin" || user?.role === "team_owner";
  const isAdmin = user?.role === "admin";

  //clear embeddings and snippets flags
  useEffect(() => {
    if (snippets.length > 0) {
      dispatch(clearSnippets());
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // Everything the first view of the list depends on, so it can be shown in
    // one go instead of growing as each request finishes.
    const loads: Promise<unknown>[] = [];
    if (
      user.role === "admin" ||
      user.role === "user" ||
      user.role === "team_owner"
    ) {
      loads.push(dispatch(fetchAllDatasets()));
    }
    // Reference pools and their links are admin-only (the endpoints reject others).
    if (user.role === "admin") {
      loads.push(dispatch(fetchReferenceDatasets()));
      loads.push(dispatch(fetchReferenceLinks()));
    }
    dispatch(getAllDatasetAnnotationStats());
    Promise.allSettled(loads).then(() => setDatasetsFetched(true));
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

  // Admins see reference pools alongside regular datasets; everyone else never
  // receives them. They come from a separate list so annotation views, which
  // read `allDatasets`, can never offer them.
  const listedDatasets = useMemo(
    () => [...(allDatasets ?? []), ...(isAdmin ? referenceDatasets : [])],
    [allDatasets, referenceDatasets, isAdmin],
  );

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
      if (typeFilter === "REFERENCE") {
        if (!d.is_reference) return false;
      } else if (typeFilter !== "all" && d.dataset_type !== typeFilter) {
        return false;
      }
      return true;
    };

    const result = listedDatasets.filter(matches);

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
  }, [listedDatasets, search, teamFilter, typeFilter, sortBy, statsById]);

  const clearFilters = () => {
    setSearch("");
    setTeamFilter("all");
    setTypeFilter("all");
  };

  const totalCount = listedDatasets.length;
  const hasAnyDatasets = totalCount > 0;
  const isLoadingList = loadsDatasets && !datasetsFetched;

  // Selection lives in the URL (?dataset=<id>) so a refresh, the files page's
  // back button and shared links keep it. The URL value is left untouched by
  // filters, but the card only shows a dataset that passes them: when the
  // selected one is filtered out, the first match is shown instead, and the
  // original selection returns once the filter is cleared. Other query params
  // are left as they are.
  const selectedParam = searchParams.get("dataset");
  const selectedFromUrl =
    selectedParam != null && Number.isFinite(Number(selectedParam))
      ? Number(selectedParam)
      : null;

  // The first-item selection is remembered per filter / sort setting. Data that
  // arrives later (reference pools for admins) can re-order the list, but must
  // not switch the card to a different dataset under the user; only a change of
  // search, team, type or sort picks a new first item. For the stats-based
  // sorts the key also changes once when the counts arrive.
  const statsSort = sortBy === "snippets" || sortBy === "annotated";
  const listKey = `${search}|${teamFilter}|${typeFilter}|${sortBy}|${
    statsSort ? statsById.size > 0 : ""
  }`;
  const [followed, setFollowed] = useState<{ key: string; id: number } | null>(
    null,
  );
  const keptFollowed =
    followed && followed.key === listKey
      ? visibleDatasets.find((d) => Number(d.id) === followed.id)
      : undefined;
  // Default pick: the first regular dataset. Admins also see reference pools in
  // the list, and those sort among the rest; they are not a sensible default
  // (their panel has no annotation setup), and picking one made the card
  // change with the order in which the lists happened to arrive.
  const defaultPick =
    visibleDatasets.find((d) => !d.is_reference) ?? visibleDatasets[0] ?? null;
  const followTarget = keptFollowed ?? defaultPick;
  if (
    followFirst &&
    followTarget &&
    (!followed ||
      followed.key !== listKey ||
      followed.id !== Number(followTarget.id))
  ) {
    // Remember the choice (adjusting state while rendering is the supported way).
    setFollowed({ key: listKey, id: Number(followTarget.id) });
  }

  const selectedDataset = useMemo(() => {
    if (followFirst) return followTarget;
    if (selectedFromUrl != null) {
      const found = visibleDatasets.find((d) => Number(d.id) === selectedFromUrl);
      if (found) return found;
    }
    return defaultPick;
  }, [followFirst, followTarget, defaultPick, selectedFromUrl, visibleDatasets]);
  const selectedId = selectedDataset ? Number(selectedDataset.id) : null;

  // On the very first appearance the page also waits for the selected dataset's
  // quick labels (kept in a session cache afterwards), so the panel shows up
  // complete in one go instead of filling in tile by tile. After that, picking
  // another dataset swaps the panel at once.
  const [firstViewReady, setFirstViewReady] = useState(false);
  const holdForLabels =
    !isLoadingList &&
    hasAnyDatasets &&
    selectedId != null &&
    !firstViewReady &&
    getCachedQuickLabels(selectedId) === undefined;
  useEffect(() => {
    if (!holdForLabels || selectedId == null) return;
    loadQuickLabels(selectedId).finally(() => setFirstViewReady(true));
  }, [holdForLabels, selectedId]);
  const showLoading = isLoadingList || holdForLabels;

  const selectDataset = useCallback(
    (id: number, closeDrawer = true) => {
      const next = new URLSearchParams(searchParams);
      next.set("dataset", String(id));
      setSearchParams(next, { replace: true });
      setFollowFirst(false);
      if (closeDrawer) setDrawerOpen(false);
    },
    [searchParams, setSearchParams],
  );

  // Arrow-key navigation keeps the mobile drawer open.
  const stepDataset = useCallback(
    (id: number) => selectDataset(id, false),
    [selectDataset],
  );

  // ArrowUp / ArrowDown in the toolbar search box pick the previous / next card
  // while the caret stays in the field.
  const handleSearchArrows = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (visibleDatasets.length === 0) return;
    e.preventDefault();
    const current = visibleDatasets.findIndex(
      (d) => Number(d.id) === selectedId,
    );
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next =
      current < 0
        ? 0
        : Math.min(Math.max(current + dir, 0), visibleDatasets.length - 1);
    stepDataset(Number(visibleDatasets[next].id));
  };

  // Keep the URL in step with the first-item selection so a refresh or a shared
  // link lands on the same dataset. The card itself does not wait for this.
  useEffect(() => {
    if (!followFirst || !selectedDataset) return;
    if (Number(selectedDataset.id) === selectedFromUrl) return;
    const next = new URLSearchParams(searchParams);
    next.set("dataset", String(selectedDataset.id));
    setSearchParams(next, { replace: true });
  }, [followFirst, selectedDataset, selectedFromUrl, searchParams, setSearchParams]);

  // First visit: pin the default selection into the URL. A param that points
  // at a dataset not loaded yet (e.g. a reference pool) is left alone.
  useEffect(() => {
    if (selectedFromUrl == null && visibleDatasets.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("dataset", String(defaultPick?.id ?? visibleDatasets[0].id));
      setSearchParams(next, { replace: true });
    }
  }, [selectedFromUrl, visibleDatasets, defaultPick, searchParams, setSearchParams]);

  // White card as in the design. Below `md` it is a 2-column grid; from `md` a
  // single row where the search field takes the remaining width, so "Clear
  // filters" (shown only while a filter is on) takes its room from the search
  // field and never adds a row or changes the height.
  const toolbar = (
    <div className="mb-5 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3 md:flex md:items-center">
      <div className="relative col-span-2 min-w-0 md:col-auto md:min-w-[140px] md:flex-1">
        <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchArrows}
          placeholder="Search by name or path…"
          aria-label="Search datasets"
          className={`${controlClass} ${ctl(search.trim() !== "")} pl-9 pr-3`}
        />
      </div>

      <SelectBox icon={<TeamOutlined />} className="md:w-[130px] lg:w-[180px]">
        <LightSelect
          value={teamFilter}
          onChange={setTeamFilter}
          label="Filter by team"
          className={`${controlClass} ${ctl(teamFilter !== "all")} pl-9 pr-9`}
          options={[
            { value: "all", label: "All teams" },
            { value: "none", label: "No team" },
            ...(allTeams ?? []).map((t: Team) => ({
              value: String(t.id),
              label: t.name,
            })),
          ]}
        />
      </SelectBox>

      <SelectBox icon={<AppstoreOutlined />} className="md:w-[130px] lg:w-[180px]">
        <LightSelect
          value={typeFilter}
          onChange={setTypeFilter}
          label="Filter by dataset type"
          className={`${controlClass} ${ctl(typeFilter !== "all")} pl-9 pr-9`}
          options={[
            { value: "all", label: "All types" },
            { value: "PAM", label: "PAM" },
            { value: "FOCAL_RECORDINGS", label: "Focal recordings" },
            ...(isAdmin
              ? [{ value: "REFERENCE" as TypeFilter, label: "Reference pools" }]
              : []),
          ]}
        />
      </SelectBox>

      <SelectBox icon={<SortAscendingOutlined />} className="col-span-2 md:col-auto md:w-[140px] lg:w-[190px]">
        <LightSelect
          value={sortBy}
          onChange={setSortBy}
          label="Sort datasets"
          className={`${controlClass} ${ctl(false)} pl-9 pr-9`}
          options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({
            value: k,
            label: SORT_LABELS[k],
          }))}
        />
      </SelectBox>

      {filtersActive && (
        <ClearFiltersLink
          onClick={clearFilters}
          className="shrink-0 self-center px-1 text-center md:text-left"
        />
      )}
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
          <div className="mb-6 mt-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold font-ibm-mono">Datasets</h1>
              <p className="sub_description_text">
                Below you can view/ edit all datasets
              </p>
            </div>
            {canManage && <AddDatasetModal />}
          </div>
          <div id="dataset_list" className="pb-10">
            {canManage && hasAnyDatasets && !showLoading && toolbar}
            {showLoading && (
              <p
                role="status"
                className="m-0 py-6 text-sm text-slate-500 font-ibm-sans"
              >
                Loading datasets…
              </p>
            )}

            {/* Watches every dataset's scan / embedding job, on screen or not. */}
            <DatasetJobsProvider datasets={listedDatasets}>
              {showLoading ? null : hasAnyDatasets && selectedDataset ? (
                <>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
                    <aside className="relative hidden min-h-[440px] lg:block">
                      <div className="absolute inset-0">
                        <DatasetList
                          datasets={visibleDatasets}
                          totalCount={totalCount}
                          selectedId={selectedId}
                          onSelect={selectDataset}
                          onStep={stepDataset}
                          statsById={statsById}
                          showSearch={!canManage}
                          search={search}
                          onSearch={setSearch}
                          filtersActive={filtersActive}
                          onClearFilters={clearFilters}
                        />
                      </div>
                    </aside>

                    <div className="min-w-0">
                      <div className="mb-3 lg:hidden">
                        <Button
                          block
                          onClick={() => setDrawerOpen(true)}
                          className="flex! items-center! justify-between!"
                        >
                          <span className="truncate">
                            Datasets: {selectedDataset.name}
                          </span>
                          <span className="ml-2 flex shrink-0 items-center gap-2 text-slate-500">
                            {formatDatasetCount(visibleDatasets.length, totalCount)}
                            <DownOutlined />
                          </span>
                        </Button>
                      </div>
                      <DatasetDetail
                        key={selectedDataset.id}
                        dataset={selectedDataset}
                      />
                    </div>
                  </div>

                  <Drawer
                    title="Datasets"
                    placement="left"
                    width={340}
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    styles={{ body: { padding: 12 } }}
                  >
                    <div className="h-[calc(100dvh-6rem)]">
                      <DatasetList
                        datasets={visibleDatasets}
                        totalCount={totalCount}
                        selectedId={selectedId}
                        onSelect={selectDataset}
                        onStep={stepDataset}
                        statsById={statsById}
                        showSearch={!canManage}
                        search={search}
                        onSearch={setSearch}
                        filtersActive={filtersActive}
                        onClearFilters={clearFilters}
                      />
                    </div>
                  </Drawer>
                </>
              ) : (
                emptyState
              )}
            </DatasetJobsProvider>
          </div>
        </div>
      </div>
    </div>
  );
};
