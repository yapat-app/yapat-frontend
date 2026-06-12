/**
 * PhaseInstructionsModal — the intro shown before each phase begins.
 */

import React from "react";
import { Modal, Button } from "antd";
import { useStudyFlow } from "../useStudyFlow";
import { getPhaseContent } from "../phaseContent";

export const PhaseInstructionsModal: React.FC = () => {
  const { enabled, stage, phaseId, beginPhase, sequenceIndex, sequenceLength, pendingTourSteps } =
    useStudyFlow();

  if (!enabled || stage !== "instructions") return null;

  const content = getPhaseContent(phaseId);
  const hasTour = pendingTourSteps.length > 0;

  return (
    <Modal
      open
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      centered
      width={560}
      title={
        <div className="flex items-center justify-between gap-3">
          <span className="font-ibm-mono">{content.title}</span>
          <span className="text-xs font-normal text-gray-400 font-ibm-sans">
            Phase {sequenceIndex + 1} of {sequenceLength}
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3 py-2">
        {content.body.map((p, i) => (
          <p key={i} className="text-sm text-gray-700 font-ibm-sans leading-6">
            {p}
          </p>
        ))}
      </div>
      <div className="flex justify-end pt-3">
        <Button type="primary" size="large" onClick={beginPhase}>
          {hasTour ? "Start guided tour" : "Begin annotating"}
        </Button>
      </div>
    </Modal>
  );
};
