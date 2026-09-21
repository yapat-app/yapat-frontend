/**
 * Explore API client — base path /api/explore.
 *
 * - 202 "building" responses are retried with backoff until the layer is
 *   ready (or the caller aborts).
 * - Identical in-flight requests are shared, so e.g. the sidebar and the
 *   projection toolbar asking for the same summary cost one round trip.
 * - Binary payloads (base64) are decoded into typed arrays here.
 */

import axios from "axios";
import api from "../axios/axiosInstance";
import type {
  ExploreFacets,
  ExploreFeedPage,
  ExploreFilters,
  ExploreProjectionMethod,
  ExploreProjectionPoints,
  ExploreProjectionState,
  ExploreRowsResponse,
  ExploreScope,
  ExploreSortField,
  ExploreSummary,
  ExploreViewport,
} from "../types/explore";

const BASE = "/api/explore";
const MAX_BUILD_WAIT_MS = 15 * 60 * 1000;

export class ExploreRequestError extends Error {
  readonly status: number | null;
  readonly code: "no_predictions" | "not_ready" | "http" | "network";

  constructor(
    message: string,
    status: number | null,
    code: ExploreRequestError["code"],
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    axios.isCancel(error) ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error as { name?: string })?.name === "CanceledError"
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function detailOf(data: unknown): string | null {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) =>
        typeof d === "object" && d && "msg" in d
          ? String((d as { msg: string }).msg)
          : String(d),
      )
      .join("; ");
  }
  return null;
}

export interface ExploreRequestOptions {
  signal?: AbortSignal;
  /** Called while the server is still building a layer. */
  onBuilding?: (layer: string) => void;
}

async function postWithBuildRetry<T>(
  path: string,
  body: unknown,
  options: ExploreRequestOptions = {},
): Promise<T> {
  const started = Date.now();
  let delay = 800;
  for (;;) {
    let response;
    try {
      response = await api.post(`${BASE}${path}`, body, {
        signal: options.signal,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 409,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      const message =
        detailOf(data) ??
        (error as { message?: string })?.message ??
        "Explore request failed";
      throw new ExploreRequestError(
        message,
        status ?? null,
        status === undefined ? "network" : status === 409 ? "not_ready" : "http",
      );
    }
    if (response.status === 409) {
      const code =
        (response.data as { status?: string })?.status === "no_predictions"
          ? "no_predictions"
          : "not_ready";
      throw new ExploreRequestError(
        detailOf(response.data) ?? "Not ready",
        409,
        code,
      );
    }
    if (response.status !== 202) return response.data as T;

    const layer = String((response.data as { layer?: string })?.layer ?? "");
    options.onBuilding?.(layer);
    if (Date.now() - started > MAX_BUILD_WAIT_MS) {
      throw new ExploreRequestError(
        "The server is still preparing this dataset. Please try again later.",
        202,
        "http",
      );
    }
    const retryAfter = Number(
      (response.data as { retry_after_ms?: number })?.retry_after_ms ?? delay,
    );
    await sleep(Math.max(retryAfter, delay), options.signal);
    delay = Math.min(delay * 1.5, 5000);
  }
}

// ── In-flight de-duplication ────────────────────────────────────────────────

const inFlight = new Map<string, Promise<unknown>>();

function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * Race a shared request against the caller's own abort signal: the shared
 * request keeps running for other waiters, this caller just stops waiting.
 */
function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

// ── Decoding ────────────────────────────────────────────────────────────────

function bytesOf(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const decode = {
  int32: (b64: string) => {
    const bytes = bytesOf(b64);
    return new Int32Array(bytes.buffer, 0, bytes.byteLength >> 2);
  },
  float32: (b64: string) => {
    const bytes = bytesOf(b64);
    return new Float32Array(bytes.buffer, 0, bytes.byteLength >> 2);
  },
  uint32: (b64: string) => {
    const bytes = bytesOf(b64);
    return new Uint32Array(bytes.buffer, 0, bytes.byteLength >> 2);
  },
  labels: (b64: string, dtype: string): Int16Array | Int32Array => {
    const bytes = bytesOf(b64);
    return dtype === "<i4"
      ? new Int32Array(bytes.buffer, 0, bytes.byteLength >> 2)
      : new Int16Array(bytes.buffer, 0, bytes.byteLength >> 1);
  },
  bits: (b64: string) => bytesOf(b64),
};

type RawPointSet = {
  count: number;
  ids: string;
  x: string;
  y: string;
  visible: string;
  label_idx: string;
};

// ── Endpoints ───────────────────────────────────────────────────────────────

export const exploreApi = {
  summary(
    scope: ExploreScope,
    filters: ExploreFilters,
    bins: number,
    options: ExploreRequestOptions = {},
  ): Promise<ExploreSummary> {
    const body = { scope, filters, bins };
    const key = `summary:${JSON.stringify(body)}`;
    return withSignal(
      shared(key, () =>
        postWithBuildRetry<ExploreSummary>("/summary", body, {
          onBuilding: options.onBuilding,
        }),
      ),
      options.signal,
    );
  },

  facets(
    scope: ExploreScope,
    options: ExploreRequestOptions = {},
  ): Promise<ExploreFacets> {
    const body = { scope };
    const key = `facets:${JSON.stringify(body)}`;
    return withSignal(
      shared(key, () =>
        postWithBuildRetry<ExploreFacets>("/facets", body, {
          onBuilding: options.onBuilding,
        }),
      ),
      options.signal,
    );
  },

  feed(
    params: {
      scope: ExploreScope;
      filters: ExploreFilters;
      sort: ExploreSortField[];
      offset: number;
      limit: number;
      anchor_snippet_id?: number | null;
      prefer_unlabeled?: boolean;
    },
    options: ExploreRequestOptions = {},
  ): Promise<ExploreFeedPage> {
    const key = `feed:${JSON.stringify(params)}`;
    return withSignal(
      shared(key, () =>
        postWithBuildRetry<ExploreFeedPage>("/feed", params, {
          onBuilding: options.onBuilding,
        }),
      ),
      options.signal,
    );
  },

  rows(
    scope: ExploreScope,
    filters: ExploreFilters,
    snippetIds: number[],
    options: ExploreRequestOptions = {},
  ): Promise<ExploreRowsResponse> {
    return postWithBuildRetry<ExploreRowsResponse>(
      "/rows",
      { scope, filters, snippet_ids: snippetIds.slice(0, 500) },
      options,
    );
  },

  async projection(
    scope: ExploreScope,
    method: ExploreProjectionMethod,
    options: ExploreRequestOptions = {},
  ): Promise<ExploreProjectionPoints> {
    const body = { scope, method };
    const key = `projection:${JSON.stringify(body)}`;
    const raw = await withSignal(
      shared(key, () =>
        postWithBuildRetry<{
          versions: ExploreProjectionPoints["versions"];
          method: ExploreProjectionMethod;
          available: boolean;
          reason: string | null;
          total_points: number;
          sampled: boolean;
          point_count: number;
          bounds: [number, number, number, number] | null;
          ids: string;
          x: string;
          y: string;
        }>("/projection", body, { onBuilding: options.onBuilding }),
      ),
      options.signal,
    );
    return {
      versions: raw.versions,
      method: raw.method,
      available: raw.available,
      reason: raw.reason,
      totalPoints: raw.total_points,
      sampled: raw.sampled,
      pointCount: raw.point_count,
      bounds: raw.bounds,
      ids: decode.int32(raw.ids),
      x: decode.float32(raw.x),
      y: decode.float32(raw.y),
    };
  },

  async projectionState(
    params: {
      scope: ExploreScope;
      filters: ExploreFilters;
      method: ExploreProjectionMethod;
      pinned_ids: number[];
      include_density: boolean;
      grid?: number;
    },
    options: ExploreRequestOptions = {},
  ): Promise<ExploreProjectionState> {
    const key = `projection-state:${JSON.stringify(params)}`;
    const raw = await withSignal(
      shared(key, () =>
        postWithBuildRetry<{
          versions: ExploreProjectionState["versions"];
          method: ExploreProjectionMethod;
          total_points: number;
          visible_points: number;
          point_count: number;
          visible: string;
          label_idx: string;
          label_dtype: string;
          label_vocab: string[];
          extras: RawPointSet;
          density: {
            nx: number;
            ny: number;
            bounds: [number, number, number, number];
            total: string;
            visible: string;
          } | null;
        }>("/projection/state", params, { onBuilding: options.onBuilding }),
      ),
      options.signal,
    );
    return {
      versions: raw.versions,
      method: raw.method,
      totalPoints: raw.total_points,
      visiblePoints: raw.visible_points,
      pointCount: raw.point_count,
      visible: decode.bits(raw.visible),
      labelIdx: decode.labels(raw.label_idx, raw.label_dtype),
      labelVocab: raw.label_vocab,
      extras: {
        count: raw.extras.count,
        ids: decode.int32(raw.extras.ids),
        x: decode.float32(raw.extras.x),
        y: decode.float32(raw.extras.y),
        visible: decode.bits(raw.extras.visible),
        labelIdx: decode.labels(raw.extras.label_idx, raw.label_dtype),
      },
      density: raw.density
        ? {
            nx: raw.density.nx,
            ny: raw.density.ny,
            bounds: raw.density.bounds,
            total: decode.uint32(raw.density.total),
            visible: decode.uint32(raw.density.visible),
          }
        : null,
    };
  },

  async projectionCoords(
    scope: ExploreScope,
    method: ExploreProjectionMethod,
    snippetIds: number[],
    options: ExploreRequestOptions = {},
  ): Promise<{ ids: Int32Array; x: Float32Array; y: Float32Array }> {
    const raw = await postWithBuildRetry<{ ids: string; x: string; y: string }>(
      "/projection/coords",
      { scope, method, snippet_ids: snippetIds.slice(0, 2000) },
      options,
    );
    return {
      ids: decode.int32(raw.ids),
      x: decode.float32(raw.x),
      y: decode.float32(raw.y),
    };
  },

  async viewport(
    params: {
      scope: ExploreScope;
      filters: ExploreFilters;
      method: ExploreProjectionMethod;
      bbox: [number, number, number, number];
      max_points: number;
    },
    options: ExploreRequestOptions = {},
  ): Promise<ExploreViewport> {
    const raw = await postWithBuildRetry<{
      versions: ExploreViewport["versions"];
      method: ExploreProjectionMethod;
      bbox: [number, number, number, number];
      complete: boolean;
      count: number;
      ids: string;
      x: string;
      y: string;
      visible: string;
      label_idx: string;
      label_dtype: string;
      label_vocab: string[];
    }>("/projection/viewport", params, options);
    return {
      versions: raw.versions,
      method: raw.method,
      bbox: raw.bbox,
      complete: raw.complete,
      count: raw.count,
      ids: decode.int32(raw.ids),
      x: decode.float32(raw.x),
      y: decode.float32(raw.y),
      visible: decode.bits(raw.visible),
      labelIdx: decode.labels(raw.label_idx, raw.label_dtype),
      labelVocab: raw.label_vocab,
    };
  },
};
