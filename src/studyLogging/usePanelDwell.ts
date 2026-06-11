/**
 * usePanelDwell — emit panel_enter on mount/active and panel_exit with durationMs
 * on unmount/inactive. Visibility-aware: the dwell clock freezes while the tab is
 * hidden so background time doesn't inflate durations.
 */

import { useEffect, useRef } from "react";
import { studyLogger } from "./StudyLogger";
import type { PanelName } from "./types";

export function usePanelDwell(panel: PanelName, active: boolean = true): void {
  const enterTs = useRef<number | null>(null);
  const accumulated = useRef(0);

  useEffect(() => {
    if (!studyLogger.isEnabled() || !active) return;

    // Begin dwell.
    accumulated.current = 0;
    enterTs.current = studyLogger.isHidden() ? null : performance.now();
    studyLogger.log("panel_enter", { panel });

    // Pause/resume the clock with tab visibility.
    const unsub = studyLogger.onVisibilityChange((hidden) => {
      if (hidden) {
        if (enterTs.current != null) {
          accumulated.current += performance.now() - enterTs.current;
          enterTs.current = null;
        }
      } else if (enterTs.current == null) {
        enterTs.current = performance.now();
      }
    });

    return () => {
      unsub();
      if (enterTs.current != null) {
        accumulated.current += performance.now() - enterTs.current;
        enterTs.current = null;
      }
      studyLogger.log("panel_exit", { panel }, { durationMs: Math.round(accumulated.current) });
    };
  }, [panel, active]);
}
