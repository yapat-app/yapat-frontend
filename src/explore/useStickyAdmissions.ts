import { useMemo, useState } from "react";
import type { FeedbackResponse } from "../types/al";

function signatures(feedbacks: Record<number, FeedbackResponse>): Map<number, string> {
  const out = new Map<number, string>();
  for (const [id, fb] of Object.entries(feedbacks)) {
    out.set(Number(id), `${fb.action}:${(fb.final_labels ?? []).join(",")}`);
  }
  return out;
}

/**
 * Snippets whose labels this user changed since the filters last changed.
 *
 * The annotation-status filter must not yank a snippet out of view the moment
 * it gets its first label (labelling is multi-select, the user is likely still
 * adding more). The server admits these ids regardless of their label state,
 * so the feed, histograms and projection keep showing them until the user
 * changes the filters — the same "sticky admission" rule the feed used to
 * apply client-side.
 */
export function useStickyAdmissions(
  resetKey: string,
  feedbacks: Record<number, FeedbackResponse>,
): number[] {
  const [baseline, setBaseline] = useState(() => ({
    resetKey,
    signatures: signatures(feedbacks),
  }));
  if (baseline.resetKey !== resetKey) {
    // Adjust state during render: a new question starts a clean slate.
    setBaseline({ resetKey, signatures: signatures(feedbacks) });
  }

  return useMemo(() => {
    const now = signatures(feedbacks);
    const changed: number[] = [];
    for (const [id, sig] of now) {
      if (baseline.signatures.get(id) !== sig) changed.push(id);
    }
    for (const id of baseline.signatures.keys()) {
      if (!now.has(id)) changed.push(id);
    }
    return changed.sort((a, b) => a - b).slice(0, 5000);
  }, [feedbacks, baseline]);
}
