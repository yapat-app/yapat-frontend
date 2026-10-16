/**
 * GuideMenu — navbar entry point for reopening the guide cards at any time.
 *
 * The first-run tour shows each card only once; this menu lets users replay
 * all of the current phase's cards, or a single card they need, whenever they
 * want. A dot on the button signals cards this browser has never shown (for
 * example a card added for a new feature after the user finished the tour).
 */

import React from "react";
import { Badge, Button, Dropdown, Tooltip, type MenuProps } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useStudyFlow } from "../useStudyFlow";
import { useStudyLogger } from "../../studyLogging";

export const GuideMenu: React.FC = () => {
  const { guideSteps, newGuideCount, startGuideReplay, isTourActive, phaseId } =
    useStudyFlow();
  const { log } = useStudyLogger();

  if (guideSteps.length === 0) return null;

  const items: MenuProps["items"] = [
    {
      key: "all",
      label: `Show all guide cards (${guideSteps.length})`,
    },
    { type: "divider" },
    {
      key: "single",
      type: "group",
      label: "Show one card",
      children: guideSteps.map((step) => ({
        key: `card:${step.featureKey}`,
        label: step.title,
      })),
    },
  ];

  const onClick: MenuProps["onClick"] = ({ key }) => {
    const steps =
      key === "all"
        ? guideSteps
        : guideSteps.filter((s) => `card:${s.featureKey}` === key);
    if (steps.length === 0) return;
    log("guide_replay_start", {
      phase: phaseId,
      stepKeys: steps.map((s) => s.featureKey),
      mode: key === "all" ? "all" : "single",
    });
    startGuideReplay(steps);
  };

  return (
    <Dropdown
      trigger={["click"]}
      // The first-run tour already covers the screen; a second tour on top of
      // it would fight for the same spotlight.
      disabled={isTourActive}
      menu={{ items, onClick }}
      placement="bottomRight"
    >
      <Tooltip
        title={
          newGuideCount > 0
            ? `Show the guide cards again — ${newGuideCount} new`
            : "Show the guide cards again"
        }
        placement="bottom"
      >
        <Badge dot={newGuideCount > 0} offset={[-4, 4]}>
          <Button
            type="text"
            icon={<QuestionCircleOutlined />}
            aria-label="Guide"
            className="text-gray-600"
          >
            Guide
          </Button>
        </Badge>
      </Tooltip>
    </Dropdown>
  );
};
