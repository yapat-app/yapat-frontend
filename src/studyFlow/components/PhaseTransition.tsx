/**
 * PhaseTransition — brief full-screen interstitial between phases, shown for a
 * couple of seconds after a phase's timer expires and before the next begins.
 */

import React from "react";
import { Spin } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import { useStudyFlow } from "../useStudyFlow";
import { getPhaseContent } from "../phaseContent";

export const PhaseTransition: React.FC = () => {
  const { enabled, stage, phaseId, nextPhaseId } = useStudyFlow();

  if (!enabled || stage !== "transition") return null;

  const next = nextPhaseId ? getPhaseContent(nextPhaseId) : null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-4 bg-white/95 backdrop-blur-sm">
      <CheckCircleFilled style={{ fontSize: 56, color: "#52c41a" }} />
      <h2 className="text-xl font-semibold font-ibm-mono text-gray-800">
        Time's up for {phaseId}
      </h2>
      {next ? (
        <>
          <p className="text-sm text-gray-500 font-ibm-sans">
            Getting the next phase ready…
          </p>
          <p className="text-base font-ibm-sans text-gray-700">{next.title}</p>
          <Spin />
        </>
      ) : (
        <p className="text-sm text-gray-500 font-ibm-sans">Wrapping up the study…</p>
      )}
    </div>
  );
};
