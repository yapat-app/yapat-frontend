import { useContext } from "react";
import { PhaseContext } from "./context";
import type { PhaseConfig } from "./types";

/** Returns the active study phase config. */
export const usePhaseConfig = (): PhaseConfig => useContext(PhaseContext).phase;

/** Full context (including setter and id) for components that need to switch phases. */
export const usePhaseContext = () => useContext(PhaseContext);
