export type FPVRequest = {
  dataset_id: number;
  model_family_name: string;
  run_3d?: boolean;
};

export type FPVVisibilityRangeResponse = {
  field: string;
  min_value: number;
  max_value: number;
  step: number;
  label: string;
};

export type FPVDatasetRequest = {
  dataset_id: number;
  embedding_model_id: number;
  run_3d?: boolean;
  method?: "pca" | "umap" | "tsne" | "isomap";
};

/** Response from POST /fpv-dataset: the job is queued on a Celery worker,
 * not computed inline. Poll GET /fpv-dataset until it succeeds. */
export type FPVGenerateAck = {
  status: "queued";
  task_id: string;
  dataset_id: number;
  embedding_model_id: number;
};

export type FPVPointMetadata = {
  snippet_id: number;
  predicted_labels: string[];
  uncertainty?: number | null;
  diversity?: number | null;
  density?: number | null;
  composite_score?: number | null;
};

export type FPVProjection2D = {
  x: number[];
  y: number[];
};

export type FPVProjection3D = {
  x: Array<number | null>;
  y: Array<number | null>;
  z: Array<number | null>;
};

/** Present only for methods permanently skipped at this dataset's size
 * (see backend FPV_UMAP_MAX_POINTS/FPV_TSNE_MAX_POINTS/FPV_ISOMAP_MAX_POINTS).
 * Absence of a key means "available or not yet known", not "definitely
 * available" -- callers should still handle a missing/empty projection. */
export type FPVMethodAvailability = {
  available: boolean;
  reason?: string | null;
};

export type FPVResponse = {
  dataset_id: number;
  model_family_name?: string | null;
  model_checkpoint_id?: number | null;
  embedding_model_id?: number | null;
  points: FPVPointMetadata[];
  projections_2d: Record<string, FPVProjection2D>;
  projections_3d?: Record<string, FPVProjection3D> | null;
  method_availability?: Record<string, FPVMethodAvailability> | null;
};

