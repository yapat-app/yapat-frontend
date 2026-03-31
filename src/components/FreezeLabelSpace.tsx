import { Button } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { freezeConversation } from "../redux/features/customTaxonomySlice";
import { useNavigate } from "react-router-dom";

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

const defaultFreezeName = () =>
  `Label space ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
const defaultFreezeDescription = () => "Frozen from pre-annotation";

export const FreezeLabelSpace = ({ labelSpace }: FreezeLabelSpaceProps) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { conversation, conversationFreezed } = useAppSelector(
    (state) => state.customTaxonomy,
  );

  const isFrozen = conversation?.is_frozen === true || conversationFreezed;

  const handleFreeze = () => {
    if (conversation?.id)
      dispatch(
        freezeConversation({
          name: defaultFreezeName(),
          description: defaultFreezeDescription(),
          conversationId: conversation.id,
        }),
      );
  };

  return (
    <div>
      {isFrozen ? (
        <div className="my-3">
          <Button
            onClick={() => navigate("/annotate")}
            className="w-full!"
            size="middle"
            type="primary"
          >
            Label Space created, Start Annotating?
          </Button>
        </div>
      ) : (
        <Button
          className="w-full!"
          size="middle"
          type="primary"
          onClick={handleFreeze}
          disabled={labelSpace.length === 0 || isFrozen}
        >
          Add To label space list
        </Button>
      )}
    </div>
  );
};
