/**
 * useALSync
 * Bidirectional sync: projection click ↔ feed scroll
 */

import { useEffect } from "react";
import { useAppSelector } from "../hooks";

export const useALSync = (
  cardRefs: React.MutableRefObject<Map<number, HTMLDivElement>>,
) => {
  const { selectedSnippetId } = useAppSelector((state) => state.al);

  useEffect(() => {
    if (selectedSnippetId !== null) {
      const el = cardRefs.current.get(selectedSnippetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedSnippetId]);
};
