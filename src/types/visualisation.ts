export type FPVRequest = {
  dataset_id: number;
  model_family_name: string;
  run_3d?: boolean;
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

export type FPVResponse = {
  dataset_id: number;
  model_family_name: string;
  model_checkpoint_id: number;
  points: FPVPointMetadata[];
  projections_2d: Record<string, FPVProjection2D>;
  projections_3d?: Record<string, FPVProjection3D> | null;
};

