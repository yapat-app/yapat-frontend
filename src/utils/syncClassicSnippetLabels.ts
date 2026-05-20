import type { AppDispatch } from "../redux/store";
import type { Annotation } from "../types";
import { annotationApi } from "../services/api";
import { createAnnotation, deleteAnnotation } from "../redux/features/annotationSlice";
import { buildAnnotationCreatePayload } from "./annotationCreatePayload";

/**
 * Persist label selection for a classic-feed snippet: DELETE removed annotations,
 * POST new ones, return fresh rows from the API.
 */
export async function syncClassicSnippetLabels(
  dispatch: AppDispatch,
  snippetId: number,
  nextLabels: string[],
  existing: Annotation[],
): Promise<Annotation[]> {
  const nextNorm = nextLabels.map((l) => l.trim()).filter(Boolean);
  const nextLower = new Set(nextNorm.map((l) => l.toLowerCase()));

  for (const ann of existing) {
    const display = ann.resolved_name_snapshot?.trim() ?? "";
    if (display && !nextLower.has(display.toLowerCase())) {
      await dispatch(deleteAnnotation(ann.id)).unwrap();
    }
  }

  const existingLower = new Set(
    existing
      .map((a) => (a.resolved_name_snapshot?.trim() ?? "").toLowerCase())
      .filter(Boolean),
  );

  for (const label of nextNorm) {
    if (existingLower.has(label.toLowerCase())) continue;
    await dispatch(
      createAnnotation(buildAnnotationCreatePayload(snippetId, label)),
    ).unwrap();
  }

  return annotationApi.getAll({ snippet_id: snippetId });
}
