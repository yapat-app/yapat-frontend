import type { EmbeddingMethod, EmbeddingOption } from "../types";

/**
 * The endpoint returns one row per embedding job, so a model re-run on another
 * snippet set appears twice. Keep the one the dataset uses: its default, else
 * the latest finished job, else the latest job.
 */
export function dedupeEmbeddingOptions(options: EmbeddingOption[]): EmbeddingOption[] {
  const byModel = new Map<number, EmbeddingOption>();
  for (const option of options) {
    const kept = byModel.get(option.embedding_model_id);
    const keepExisting =
      kept !== undefined &&
      (kept.is_default || (kept.status === "completed" && option.status !== "completed"));
    if (!keepExisting) byModel.set(option.embedding_model_id, option);
  }
  return [...byModel.values()];
}

/** The saved model if it can still be selected, else the dataset's default. */
export function pickEmbeddingOption(
  options: EmbeddingOption[],
  preferredModelId: number | null | undefined,
): EmbeddingOption | null {
  const completed = options.filter((o) => o.status === "completed");
  return (
    completed.find((o) => o.embedding_model_id === preferredModelId) ??
    completed.find((o) => o.is_default) ??
    completed[0] ??
    null
  );
}

/** "birdnet 3.0-preview3.1 · 3 s" */
export function embeddingOptionLabel(option: EmbeddingOption): string {
  return `${option.name} ${option.version} · ${option.window_size} s`;
}

/** Names the job's model once it is known, so the text is never the wrong model. */
export function computingEmbeddingsLabel(option: EmbeddingOption | null): string {
  return option ? `Computing ${option.name} ${option.version} embeddings` : "Computing embeddings";
}

/** Why this model can't be started on the dataset, or null when it can. */
export function embeddingMethodBlockedReason(
  method: EmbeddingMethod,
  options: EmbeddingOption[],
): string | null {
  const status = dedupeEmbeddingOptions(options).find(
    (o) => o.embedding_model_id === method.id,
  )?.status;
  if (status === "completed") return "Embeddings generated";
  if (status === "failed") return "Embedding failed";
  if (status) return "Generating embeddings";
  return method.weights_available === false ? "Not available on this server" : null;
}

/** True when every model is blocked, so the generate modal would have nothing to pick. */
export function noEmbeddingModelsLeft(
  methods: EmbeddingMethod[],
  options: EmbeddingOption[],
): boolean {
  return (
    methods.length > 0 &&
    methods.every((m) => embeddingMethodBlockedReason(m, options) !== null)
  );
}

/** How many models the dataset can be annotated with. */
export function readyEmbeddingModelCount(options: EmbeddingOption[]): number {
  return dedupeEmbeddingOptions(options).filter((o) => o.status === "completed").length;
}

export type EmbeddingOptionGroup = {
  snippetSetId: number;
  /** Its models show the same snippets and labels. */
  shared: boolean;
  options: EmbeddingOption[];
};

/** The dataset's models by snippet set; the default model and its set come first. */
export function groupEmbeddingOptions(options: EmbeddingOption[]): EmbeddingOptionGroup[] {
  const defaultFirst = [...dedupeEmbeddingOptions(options)].sort(
    (a, b) => Number(b.is_default) - Number(a.is_default),
  );
  const bySet = new Map<number, EmbeddingOption[]>();
  for (const option of defaultFirst) {
    bySet.set(option.snippet_set_id, [...(bySet.get(option.snippet_set_id) ?? []), option]);
  }
  return [...bySet].map(([snippetSetId, members]) => ({
    snippetSetId,
    shared: members.length > 1,
    options: members,
  }));
}

/** What starting this model on the dataset will do, or null for its first model. */
export function embeddingStartNote(
  method: EmbeddingMethod,
  options: EmbeddingOption[],
): string | null {
  const others = options.filter(
    (o) => o.status !== "failed" && o.embedding_model_id !== method.id,
  );
  if (others.length === 0) return null;
  const sharing = others.find(
    (o) =>
      o.window_size === method.window_size &&
      o.step_size === method.step_size &&
      o.overlap === method.overlap,
  );
  return sharing
    ? `Shares snippets and labels with ${sharing.name} ${sharing.version}`
    : "Creates new snippets with separate labels";
}
