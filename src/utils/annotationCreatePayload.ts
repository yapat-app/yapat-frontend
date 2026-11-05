import type { AnnotationCreate } from "../types";

/** Matches backend AnnotationBase.taxon_id pattern. */
const TAXON_ID_RE = /^([a-z]+:[a-zA-Z0-9_-]+|custom:[a-f0-9-]+)$/;

/**
 * Build a valid POST /api/annotations/ body for a display label (PAM, GBIF, taxonomy).
 * Plain names like "Aves" must not be sent as taxon_id — use local:slug or species_name.
 */
export function buildAnnotationCreatePayload(
  snippetId: number,
  label: string,
  embeddingModelId: number | null,
): AnnotationCreate {
  const display = label.trim();
  if (!display) {
    throw new Error("Label is empty");
  }
  const model = embeddingModelId === null ? {} : { embedding_model_id: embeddingModelId };

  if (TAXON_ID_RE.test(display)) {
    return {
      snippet_id: snippetId,
      taxon_id: display,
      display_name: display,
      ...model,
    };
  }

  // PAM labels.json / free-text quick labels — stable local id (no GBIF required).
  const slug = display
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 120);

  return {
    snippet_id: snippetId,
    taxon_id: `local:${slug || "label"}`,
    display_name: display,
    ...model,
  };
}
