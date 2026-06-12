/**
 * StudyFlowOverlays — mounts all of the flow's full-screen UI in one place.
 * Drop this once on the annotation page; each child self-gates on stage.
 */

import React from "react";
import { PhaseInstructionsModal } from "./PhaseInstructionsModal";
import { PhaseTour } from "./PhaseTour";
import { PhaseTransition } from "./PhaseTransition";
import { StudyCompleteScreen } from "./StudyCompleteScreen";

export const StudyFlowOverlays: React.FC = () => (
  <>
    <PhaseInstructionsModal />
    <PhaseTour />
    <PhaseTransition />
    <StudyCompleteScreen />
  </>
);
