/**
 * PhaseTimer — compact countdown badge for the toolbar. Visible only while the
 * participant is actively annotating (the "running" stage).
 */

import React from "react";
import { Tag, Tooltip } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { useStudyFlow } from "../useStudyFlow";

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const PhaseTimer: React.FC = () => {
  const { enabled, stage, remainingMs } = useStudyFlow();

  if (!enabled || stage !== "running") return null;

  // Warn (amber) in the last minute, danger (red) in the last 15 seconds.
  const color =
    remainingMs <= 15_000 ? "error" : remainingMs <= 60_000 ? "warning" : "blue";

  return (
    <Tooltip title="Time left in this phase — the study advances automatically when it reaches 0:00">
      <Tag icon={<ClockCircleOutlined />} color={color} className="text-xs font-ibm-mono">
        {fmt(remainingMs)}
      </Tag>
    </Tooltip>
  );
};
