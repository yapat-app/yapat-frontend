import { useContext } from "react";
import { StudyFlowContext } from "./context";

/** Access the guided study-flow state machine. */
export const useStudyFlow = () => useContext(StudyFlowContext);
