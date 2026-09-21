/**
 * Server-driven feed: a sparse page cache over /api/explore/feed.
 *
 * The browser only ever holds the pages the user has scrolled near. Changing
 * the scope, filters or sort starts a new query (new key); results for older
 * keys are discarded. Sticky ids ride along on every page request without
 * being part of the key, so labelling a row never reshuffles loaded pages and
 * later pages stay consistent with earlier ones.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exploreApi, isAbortError } from "../services/exploreApi";
import type {
  ExploreFeedPage,
  ExploreFeedRow,
  ExploreFilters,
  ExploreScope,
  ExploreSortField,
} from "../types/explore";
import { filterViewKey } from "./filters";

export const EXPLORE_FEED_PAGE_SIZE = 50;

interface FeedState {
  key: string | null;
  /** Same question on the same snippet set (ignores checkpoint/revision). */
  softKey: string | null;
  total: number | null;
  pages: ReadonlyMap<number, ExploreFeedRow[]>;
  extraRows: ReadonlyMap<number, ExploreFeedRow>;
  error: Error | null;
  building: boolean;
}

const EMPTY_PAGES: ReadonlyMap<number, ExploreFeedRow[]> = new Map();
const EMPTY_ROWS: ReadonlyMap<number, ExploreFeedRow> = new Map();

export interface ExploreFeedController {
  /** Identifies scope + filters + sort; null when disabled. */
  queryKey: string | null;
  /** Filters + sort only — changes when the user asks a different question. */
  viewKey: string;
  total: number | null;
  loading: boolean;
  building: boolean;
  error: Error | null;
  rowAt: (index: number) => ExploreFeedRow | undefined;
  indexOf: (snippetId: number) => number;
  rowById: (snippetId: number) => ExploreFeedRow | undefined;
  ensureRange: (start: number, end: number) => void;
  /** Resolve a snippet's position (optionally the next unlabeled after it). */
  locate: (
    snippetId: number,
    preferUnlabeled: boolean,
  ) => Promise<{ index: number; snippetId: number } | null>;
  /** Fetch rows for arbitrary snippets (e.g. a projection click). */
  loadRows: (snippetIds: number[]) => Promise<void>;
  /** Refresh labels/scores of specific rows in place (no reordering). */
  refreshRows: (snippetIds: number[]) => Promise<void>;
}

export function useExploreFeed(opts: {
  scope: ExploreScope | null;
  filters: ExploreFilters;
  sort: ExploreSortField[];
  enabled: boolean;
  /** Data revision (see useExploreScope) — a change reloads pages in place. */
  revision?: string;
  pageSize?: number;
}): ExploreFeedController {
  const { scope, filters, sort, enabled, revision = "" } = opts;
  const pageSize = opts.pageSize ?? EXPLORE_FEED_PAGE_SIZE;

  const viewKey = useMemo(
    () => JSON.stringify({ f: filterViewKey(filters), s: sort }),
    [filters, sort],
  );
  const queryKey =
    enabled && scope ? JSON.stringify({ scope, v: viewKey, pageSize, revision }) : null;
  // A new checkpoint or inference revision refreshes the data but asks the
  // same question: keep showing the previous rows until the new ones land, so
  // the feed never collapses to a spinner (and loses its scroll) mid-session.
  const softKey =
    enabled && scope
      ? JSON.stringify({ d: scope.dataset_id, s: scope.snippet_set_id, v: viewKey, pageSize })
      : null;

  const [state, setState] = useState<FeedState>({
    key: null,
    softKey: null,
    total: null,
    pages: EMPTY_PAGES,
    extraRows: EMPTY_ROWS,
    error: null,
    building: false,
  });

  // Latest request inputs, readable from async callbacks.
  const latest = useRef({ scope, filters, sort, queryKey, softKey });
  useEffect(() => {
    latest.current = { scope, filters, sort, queryKey, softKey };
  }, [scope, filters, sort, queryKey, softKey]);

  const inFlight = useRef<Set<string>>(new Set());
  const controllerRef = useRef<AbortController | null>(null);

  const isCurrent = queryKey !== null && state.key === queryKey;
  const current =
    isCurrent || (queryKey !== null && softKey !== null && state.softKey === softKey)
      ? state
      : null;
  const pages = current?.pages ?? EMPTY_PAGES;
  const extraRows = current?.extraRows ?? EMPTY_ROWS;
  // Pages that belong to the current key (stale rows are display-only).
  const freshPages = isCurrent ? state.pages : EMPTY_PAGES;

  const freshState = (key: string, prev: FeedState): FeedState => ({
    key,
    softKey: latest.current.softKey,
    total: null,
    pages: EMPTY_PAGES,
    extraRows: prev.softKey === latest.current.softKey ? prev.extraRows : EMPTY_ROWS,
    error: null,
    building: false,
  });

  const applyPage = useCallback(
    (key: string, page: ExploreFeedPage) => {
      setState((prev) => {
        const base: FeedState = prev.key === key ? prev : freshState(key, prev);
        const nextPages = new Map(base.pages);
        nextPages.set(Math.floor(page.offset / pageSize), page.rows);
        return { ...base, total: page.total, pages: nextPages, error: null, building: false };
      });
    },
    [pageSize],
  );

  const fetchPage = useCallback(
    (pageIndex: number) => {
      const { scope: s, filters: f, sort: so, queryKey: key } = latest.current;
      if (!s || !key) return;
      const flightKey = `${key}#${pageIndex}`;
      if (inFlight.current.has(flightKey)) return;
      inFlight.current.add(flightKey);
      const signal = controllerRef.current?.signal;
      exploreApi
        .feed(
          { scope: s, filters: f, sort: so, offset: pageIndex * pageSize, limit: pageSize },
          {
            signal,
            onBuilding: () =>
              setState((prev) => (prev.key === key && !prev.building ? { ...prev, building: true } : prev)),
          },
        )
        .then((page) => {
          if (latest.current.queryKey !== key) return;
          applyPage(key, page);
        })
        .catch((error: unknown) => {
          if (isAbortError(error) || latest.current.queryKey !== key) return;
          setState((prev) => ({
            ...(prev.key === key ? prev : freshState(key, prev)),
            error: error instanceof Error ? error : new Error(String(error)),
            building: false,
          }));
        })
        .finally(() => {
          inFlight.current.delete(flightKey);
        });
    },
    [applyPage, pageSize],
  );

  // New question → abort the old one and load the first page.
  useEffect(() => {
    controllerRef.current?.abort();
    inFlight.current.clear();
    if (!queryKey) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    fetchPage(0);
    return () => controller.abort();
  }, [queryKey, fetchPage]);

  const rowAt = useCallback(
    (index: number) => pages.get(Math.floor(index / pageSize))?.[index % pageSize],
    [pages, pageSize],
  );

  const idIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (const [pageIndex, rows] of pages) {
      rows.forEach((row, i) => map.set(row.snippet_id, pageIndex * pageSize + i));
    }
    return map;
  }, [pages, pageSize]);

  const indexOf = useCallback((snippetId: number) => idIndex.get(snippetId) ?? -1, [idIndex]);

  const rowById = useCallback(
    (snippetId: number) => {
      const index = idIndex.get(snippetId);
      if (index !== undefined) return rowAt(index);
      return extraRows.get(snippetId);
    },
    [idIndex, rowAt, extraRows],
  );

  const total = current?.total ?? null;
  const ensureRange = useCallback(
    (start: number, end: number) => {
      if (!queryKey) return;
      const last = total === null ? start : Math.min(end, total);
      const first = Math.max(0, start);
      for (let p = Math.floor(first / pageSize); p <= Math.floor(Math.max(first, last - 1) / pageSize); p++) {
        if (!freshPages.has(p) && (total === null ? p === 0 : p * pageSize < total)) fetchPage(p);
      }
    },
    [queryKey, total, freshPages, pageSize, fetchPage],
  );

  const locate = useCallback(
    async (snippetId: number, preferUnlabeled: boolean) => {
      const { scope: s, filters: f, sort: so, queryKey: key } = latest.current;
      if (!s || !key) return null;
      try {
        const page = await exploreApi.feed(
          {
            scope: s,
            filters: f,
            sort: so,
            offset: 0,
            limit: pageSize,
            anchor_snippet_id: snippetId,
            prefer_unlabeled: preferUnlabeled,
          },
          { signal: controllerRef.current?.signal },
        );
        if (latest.current.queryKey !== key) return null;
        applyPage(key, page);
        if (page.anchor_index === null || page.anchor_snippet_id === null) return null;
        return { index: page.anchor_index, snippetId: page.anchor_snippet_id };
      } catch (error) {
        if (!isAbortError(error)) console.error("Failed to locate snippet in feed", error);
        return null;
      }
    },
    [applyPage, pageSize],
  );

  const mergeRows = useCallback((key: string, rows: ExploreFeedRow[], asExtra: boolean) => {
    if (rows.length === 0) return;
    const byId = new Map(rows.map((r) => [r.snippet_id, r]));
    setState((prev) => {
      if (prev.key !== key) return prev;
      let pagesChanged = false;
      const nextPages = new Map(prev.pages);
      for (const [pageIndex, pageRows] of prev.pages) {
        if (!pageRows.some((r) => byId.has(r.snippet_id))) continue;
        nextPages.set(
          pageIndex,
          pageRows.map((r) => byId.get(r.snippet_id) ?? r),
        );
        pagesChanged = true;
      }
      let nextExtra = prev.extraRows;
      if (asExtra || rows.some((r) => prev.extraRows.has(r.snippet_id))) {
        const extra = new Map(prev.extraRows);
        for (const row of rows) {
          if (asExtra || extra.has(row.snippet_id)) extra.set(row.snippet_id, row);
        }
        // Keep the overlay cache bounded.
        while (extra.size > 500) extra.delete(extra.keys().next().value as number);
        nextExtra = extra;
      }
      return {
        ...prev,
        pages: pagesChanged ? nextPages : prev.pages,
        extraRows: nextExtra,
      };
    });
  }, []);

  const fetchRows = useCallback(
    async (snippetIds: number[], asExtra: boolean) => {
      const { scope: s, filters: f, queryKey: key } = latest.current;
      if (!s || !key || snippetIds.length === 0) return;
      try {
        for (let i = 0; i < snippetIds.length; i += 500) {
          const resp = await exploreApi.rows(s, f, snippetIds.slice(i, i + 500), {
            signal: controllerRef.current?.signal,
          });
          if (latest.current.queryKey !== key) return;
          mergeRows(key, resp.rows, asExtra);
        }
      } catch (error) {
        if (!isAbortError(error)) console.error("Failed to load feed rows", error);
      }
    },
    [mergeRows],
  );

  const loadRows = useCallback((ids: number[]) => fetchRows(ids, true), [fetchRows]);
  const refreshRows = useCallback((ids: number[]) => fetchRows(ids, false), [fetchRows]);

  // `state.key` lags `queryKey` after a change — treat that as loading.
  const loading =
    queryKey !== null && (!isCurrent || (state.total === null && !state.error));

  return {
    queryKey,
    viewKey,
    total,
    loading,
    building: current?.building ?? false,
    error: current?.error ?? null,
    rowAt,
    indexOf,
    rowById,
    ensureRange,
    locate,
    loadRows,
    refreshRows,
  };
}
