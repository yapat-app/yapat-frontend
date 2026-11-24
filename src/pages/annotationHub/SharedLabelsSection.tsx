/**
 * Sidebar section for labels shared between the dataset's embedding models:
 * counts, and (admins and team owners) a one-way transfer of another model's
 * labels into the model the hub annotates with.
 */
import React, { useState } from "react";
import { Button, Tooltip } from "antd";
import { LinkOutlined, SwapOutlined } from "@ant-design/icons";
import { CollapsibleSection } from "./CollapsibleSection";
import { TransferLabelsDialog } from "./TransferLabelsDialog";
import type { LabelSharingSession } from "./useLabelSharing";
import type { EmbeddingOption } from "../../types";

const fmt = new Intl.NumberFormat();

type Props = {
  session: LabelSharingSession;
  isManager: boolean;
  /** The dataset's embedding models (the hub's model switcher options). */
  models: EmbeddingOption[];
  /** The model the hub annotates with: the transfer's target. */
  currentModelId: number | null;
};

const Count: React.FC<{
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
}> = ({ label, value, hint, strong }) => (
  <Tooltip title={hint}>
    <div className="flex items-baseline justify-between gap-2 text-fs-11 font-ibm-sans">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`m-0 font-semibold ${strong ? "text-orange-700" : "text-gray-800"}`}
      >
        {fmt.format(value)}
      </dd>
    </div>
  </Tooltip>
);

export const SharedLabelsSection: React.FC<Props> = ({
  session,
  isManager,
  models,
  currentModelId,
}) => {
  const [transferOpen, setTransferOpen] = useState(false);
  const { summary } = session;
  if (!session.enabled || !summary) return null;
  const nothingYet =
    summary.auto_shared +
      summary.pending +
      summary.accepted +
      summary.rejected +
      summary.relabelled ===
    0;

  return (
    <CollapsibleSection
      title="Shared labels"
      icon={<LinkOutlined />}
      defaultOpen={session.reviewing || session.pendingHere > 0}
    >
      <div className="flex flex-col gap-2.5" data-tour="shared-labels">
        <p className="m-0 text-fs-11 leading-snug text-gray-500 font-ibm-sans">
          Labels are copied between this dataset's models where their snippets
          overlap. Reviewing the uncertain ones is optional: until you accept
          one, its snippet counts as unlabeled.
        </p>

        {!nothingYet && (
          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1">
            <Count
              label="Copied"
              value={summary.auto_shared}
              hint="Copied automatically because the label must hold for the other snippet"
            />
            <Count label="To review here" value={session.pendingHere} strong />
            <Count label="Accepted" value={summary.accepted} />
            <Count label="Rejected" value={summary.rejected} />
            <Count label="Relabelled" value={summary.relabelled} />
            <Count
              label="Other models"
              value={session.pendingElsewhere}
              hint="Suggestions on the snippets of this dataset's other embedding models. Review them by annotating with that model."
            />
          </dl>
        )}

        {session.pendingHere > 0 && !session.reviewing && (
          <Button
            size="small"
            onClick={() => session.setReviewing(true, "sidebar_section")}
          >
            Review {fmt.format(session.pendingHere)} suggestions
          </Button>
        )}

        {/* One-way transfer of another model's labels into this model. New
            labels are shared as they are saved; this brings over older ones. */}
        {isManager && (
          <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
            <Button
              size="small"
              icon={<SwapOutlined />}
              loading={session.transferring !== null}
              onClick={() => setTransferOpen(true)}
            >
              {session.transferring !== null
                ? `Transferring from ${session.transferring}…`
                : "Transfer labels into this model…"}
            </Button>
            <span className="text-fs-10 text-gray-400 font-ibm-sans">
              Admins and team owners only.
            </span>
          </div>
        )}
      </div>
      {isManager && (
        <TransferLabelsDialog
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          options={models}
          currentModelId={currentModelId}
          labelledBySet={session.labelledBySet}
          onTransfer={(id, name) => void session.transferFrom(id, name)}
        />
      )}
    </CollapsibleSection>
  );
};

SharedLabelsSection.displayName = "SharedLabelsSection";
