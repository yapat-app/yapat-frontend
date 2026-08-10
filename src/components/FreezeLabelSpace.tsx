import { Alert, Button } from "antd";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  submitLabelSpace,
  clearLabelSpaceSubmitted,
} from "../redux/features/customTaxonomySlice";
import { message } from "antd";

interface LabelSpaceItem {
  id: string;
  name: string;
  scientific_name: string;
  canonical_name: string;
  taxon_id: string;
  metadata: {
    iri: string;
    rank: string;
    tool: string;
    score: null | number;
    family: null | string;
    source: string;
    kingdom: null | string;
    description: null | string;
  };
  added_at: string;
}

type FreezeLabelSpaceProps = {
  labelSpace: LabelSpaceItem[];
};

/**
 * Finalizes the working label space into a submitted `Version N` awaiting the
 * team owner's approval (versioned flow — POST /chat/{id}/submit). A submitted
 * version is NOT usable for annotation until the owner promotes it to active.
 */
export const FreezeLabelSpace = ({ labelSpace }: FreezeLabelSpaceProps) => {
  const dispatch = useAppDispatch();
  const { conversation, submitting, labelSpaceSubmitted, submittedVersion } =
    useAppSelector((state) => state.customTaxonomy);

  const isSubmitted = conversation?.is_frozen === true || labelSpaceSubmitted;

  useEffect(() => {
    if (labelSpaceSubmitted) {
      message.success("Label space submitted", undefined, () =>
        dispatch(clearLabelSpaceSubmitted()),
      );
    }
  }, [labelSpaceSubmitted, dispatch]);

  const handleSubmit = () => {
    if (conversation?.id)
      dispatch(submitLabelSpace({ conversationId: conversation.id }));
  };

  if (isSubmitted) {
    return (
      <Alert
        type="success"
        showIcon
        message={
          submittedVersion?.name
            ? `Submitted as ${submittedVersion.name}`
            : "Label space submitted"
        }
        description="Awaiting the team owner's approval. Once promoted, it becomes the active label space used for annotation."
      />
    );
  }

  return (
    <Button
      className="w-full!"
      size="middle"
      type="primary"
      onClick={handleSubmit}
      loading={submitting}
      disabled={labelSpace.length === 0 || submitting}
    >
      Submit label space
    </Button>
  );
};
