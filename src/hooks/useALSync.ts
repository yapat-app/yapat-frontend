/**
 * useALSync
 * Bidirectional sync: projection click ↔ feed scroll
 */

import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { useAppSelector } from "../hooks";

export type ALSyncOptions = {
  /**
   * When true, skip scrollIntoView for this effect run (e.g. selection was
   * updated from scroll-snapping the feed so we must not fight the scroll position).
   */
  skipScrollIntoViewRef?: MutableRefObject<boolean>;
};

export const useALSync = (
  cardRefs: MutableRefObject<Map<number, HTMLDivElement>>,
  options?: ALSyncOptions,
) => {
  const selectedSnippetId = useAppSelector((state) => state.al.selectedSnippetIds[0] ?? null);
  const skipRef = options?.skipScrollIntoViewRef;

  useEffect(() => {
    if (skipRef?.current) return;
    if (selectedSnippetId !== null) {
      const el = cardRefs.current.get(selectedSnippetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedSnippetId, cardRefs, skipRef]);
};
