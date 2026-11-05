import React from "react";
import { Modal, Select, Tag, Tooltip } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import type { EmbeddingOption } from "../../types";
import { embeddingOptionLabel } from "../../utils/embeddingOptions";

interface Props {
  options: EmbeddingOption[];
  selected: EmbeddingOption | null;
  /** A first classifier is training for the selected model and polled from here. */
  trainingClassifier: boolean;
  onSwitch: (option: EmbeddingOption) => void;
  /** The dropdown opened: a good moment to refresh statuses and classifiers. */
  onOpen: () => void;
}

/**
 * Picks the embedding model the hub works on. Hidden while the dataset has only
 * one, so such a dataset looks the way it always has.
 */
export const EmbeddingModelSwitcher: React.FC<Props> = ({
  options,
  selected,
  trainingClassifier,
  onSwitch,
  onOpen,
}) => {
  const [modal, modalHolder] = Modal.useModal();

  if (options.length <= 1) return null;

  const handleChange = (modelId: number) => {
    const option = options.find((o) => o.embedding_model_id === modelId);
    if (!option) return;
    if (selected === null || option.snippet_set_id === selected.snippet_set_id) {
      onSwitch(option);
      return;
    }
    void modal.confirm({
      title: `Switch to ${embeddingOptionLabel(option)}?`,
      content:
        "This model uses different snippets, so you will see different snippets and labels. " +
        "Your labels on the current snippets are kept.",
      okText: "Switch",
      onOk: () => onSwitch(option),
    });
  };

  const select = (
    <Select
      aria-label="Embedding model"
      size="middle"
      style={{ width: 280 }}
      popupMatchSelectWidth={400}
      value={selected?.embedding_model_id}
      disabled={trainingClassifier}
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
      onChange={handleChange}
      options={options.map((o) => ({
        value: o.embedding_model_id,
        label: embeddingOptionLabel(o),
        disabled: o.status !== "completed",
        option: o,
      }))}
      optionRender={({ data }) => (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{data.label}</span>
          {data.option.status !== "completed" ? (
            <Tag
              color={data.option.status === "failed" ? "error" : "processing"}
              className="m-0 text-fs-10"
            >
              {data.option.status}
            </Tag>
          ) : (
            <Tooltip
              title={
                data.option.shares_snippet_set
                  ? "Shows the same snippets and labels as the models sharing them"
                  : "Has its own snippets and labels"
              }
            >
              <Tag className="m-0 text-fs-10">
                {data.option.shares_snippet_set ? "shared snippets, labels" : "separate snippets, labels"}
              </Tag>
            </Tooltip>
          )}
        </div>
      )}
    />
  );

  return (
    <div data-tour="embedding-model" className="flex items-center gap-2">
      {modalHolder}
      <ApartmentOutlined className="text-gray-400 text-sm" />
      {trainingClassifier ? (
        <Tooltip title="Available again when the classifier finishes training">{select}</Tooltip>
      ) : (
        select
      )}
    </div>
  );
};

EmbeddingModelSwitcher.displayName = "EmbeddingModelSwitcher";
