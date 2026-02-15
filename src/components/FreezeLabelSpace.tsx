import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  Card,
  Input,
  List,
  Space,
  Tag,
  Typography,
  Spin,
  message,
  Modal,
  Divider,
} from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { freezeConversation } from "../redux/features/customTaxonomySlice";

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

export const FreezeLabelSpace = ({ labelSpace }: FreezeLabelSpaceProps) => {
  const dispatch = useAppDispatch();
  const [openFreeze, setOpenFreeze] = useState(false);
  const { conversation } = useAppSelector((state) => state.customTaxonomy);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleFreeze = () => {
    if (conversation?.id)
      dispatch(
        freezeConversation({
          name,
          description,
          conversationId: conversation.id,
        }),
      );
    setOpenFreeze(false);
  };

  return (
    <div>
      <Modal
        title="Freeze label space"
        centered
        open={openFreeze}
        onCancel={() => setOpenFreeze(false)}
        footer={[
          <Button key="cancel" onClick={() => setOpenFreeze(false)}>
            Cancel
          </Button>,
          <Button key="freeze" type="primary" onClick={handleFreeze}>
            Freeze
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <label>Name:</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name"
          />
        </div>
        <div>
          <label>Description:</label>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter description"
          />
        </div>
      </Modal>

      <Button
        className="w-full!"
        size="middle"
        type="primary"
        onClick={() => setOpenFreeze(true)}
        disabled={labelSpace.length === 0}
      >
        Add To label space list
      </Button>
    </div>
  );
};
