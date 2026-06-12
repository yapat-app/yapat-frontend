/**
 * StudyCompleteScreen — final thank-you shown after the last phase finishes.
 */

import React from "react";
import { Result, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useStudyFlow } from "../useStudyFlow";

export const StudyCompleteScreen: React.FC = () => {
  const { enabled, stage } = useStudyFlow();
  const navigate = useNavigate();

  if (!enabled || stage !== "complete") return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-white">
      <Result
        status="success"
        title="Study complete — thank you!"
        subTitle="You have finished all phases. You can close this tab now, or let the study coordinator know you're done."
        extra={
          <Button type="primary" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        }
      />
    </div>
  );
};
