/**
 * LoggerContextBridge — pushes the React-only phase id into the singleton.
 *
 * Phase lives in React context (not Redux), so this tiny component is the single
 * adapter that keeps the logger's envelope phaseId current. Mount it once, under
 * StudyPhaseProvider. Renders nothing.
 */

import { useEffect } from "react";
import { usePhaseContext } from "../studyPhases";
import { studyLogger } from "./StudyLogger";
import { installDevInspector } from "./devInspector";

export const LoggerContextBridge: React.FC = () => {
  const { phaseId } = usePhaseContext();

  useEffect(() => {
    installDevInspector();
  }, []);

  useEffect(() => {
    studyLogger.setPhaseId(phaseId);
  }, [phaseId]);

  return null;
};
