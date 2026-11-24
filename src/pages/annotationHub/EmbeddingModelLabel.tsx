import React from "react";
import { Tooltip } from "antd";
import { ApartmentOutlined, WarningOutlined } from "@ant-design/icons";
import type { EmbeddingOption } from "../../types";
import type { PAMCheckpoint } from "../../types/al";

interface Props {
  selected: EmbeddingOption | null;
  /** The classifier the hub uses; its training record names skipped pools. */
  checkpoint?: PAMCheckpoint | null;
}

const SKIP_REASON: Record<string, string> = {
  not_embedded: "not embedded with this model",
  no_snippets: "no usable snippets for this model",
};

/**
 * Names the embedding model the hub works on. Read-only: the hub always uses
 * the dataset's default model, and nobody can switch it from here.
 *
 * When the classifier's last training left out a linked reference pool, an
 * amber note says so (issue #93, part 3): reference data trains the model
 * too, and a pool missing silently would change results unnoticed.
 */
export const EmbeddingModelLabel: React.FC<Props> = ({ selected, checkpoint }) => {
  if (!selected) return null;
  // "Perch 2.0 · 5 s snippets"
  const name = selected.name.charAt(0).toUpperCase() + selected.name.slice(1);
  const text = `${name} ${selected.version} · ${selected.window_size} s snippets`;
  const skipped =
    checkpoint && checkpoint.id === selected.active_checkpoint_id
      ? (checkpoint.hyperparameters?.reference_pool?.skipped ?? [])
      : [];
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Tooltip title="Embedding model for this dataset, set on its dataset card">
        <div
          data-tour="embedding-model"
          aria-label={`Embedding model: ${text}`}
          className="flex items-center gap-1 text-xs font-light text-gray-400"
        >
          <ApartmentOutlined />
          <span>{text}</span>
        </div>
      </Tooltip>
      {skipped.length > 0 && (
        <Tooltip
          title={
            <div className="flex flex-col gap-1">
              <span>
                The classifier's last training left out{" "}
                {skipped.length === 1 ? "this reference pool" : "these reference pools"}:
              </span>
              {skipped.map((s) => (
                <span key={s.dataset_id}>
                  • {s.name}: {SKIP_REASON[s.code ?? ""] ?? s.reason}
                </span>
              ))}
              <span>
                An admin can embed missing pools from the dataset card; the next
                training then includes them.
              </span>
            </div>
          }
        >
          <span
            tabIndex={0}
            className="inline-flex cursor-help items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-fs-11 font-medium text-amber-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <WarningOutlined aria-hidden />
            {skipped.length} reference pool{skipped.length === 1 ? "" : "s"} left
            out
          </span>
        </Tooltip>
      )}
    </div>
  );
};

EmbeddingModelLabel.displayName = "EmbeddingModelLabel";
