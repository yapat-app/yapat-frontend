import React from "react";
import { Tooltip } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import type { EmbeddingOption } from "../../types";

interface Props {
  selected: EmbeddingOption | null;
}

/**
 * Names the embedding model the hub works on. Read-only: the hub always uses
 * the dataset's default model, and nobody can switch it from here.
 */
export const EmbeddingModelLabel: React.FC<Props> = ({ selected }) => {
  if (!selected) return null;
  // "Perch 2.0 · 5 s clips"
  const name = selected.name.charAt(0).toUpperCase() + selected.name.slice(1);
  const text = `${name} ${selected.version} · ${selected.window_size} s clips`;
  return (
    <Tooltip title="Embedding model for this dataset, set on its dataset card">
      <div
        data-tour="embedding-model"
        aria-label={`Embedding model: ${text}`}
        className="flex items-center gap-1 text-xs font-light text-gray-400 whitespace-nowrap"
      >
        <ApartmentOutlined />
        <span>{text}</span>
      </div>
    </Tooltip>
  );
};

EmbeddingModelLabel.displayName = "EmbeddingModelLabel";
