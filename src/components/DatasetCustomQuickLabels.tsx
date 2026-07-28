import { useCallback, useEffect, useState } from "react";
import { Button, Spin, Tooltip, Typography, message } from "antd";
import { CloseOutlined, EditOutlined } from "@ant-design/icons";
import type { Dataset, QuickLabel } from "../types";
import { datasetApi } from "../services/api";
import { DatasetQuickLabelsModal } from "./DatasetQuickLabelsModal";

type Props = {
  dataset: Dataset;
  /**
   * Bump this to force a re-fetch of the stored quick labels — e.g. after a
   * conversation freeze writes the frozen label space into the dataset's
   * quick_labels on the backend.
   */
  refreshSignal?: number;
};

/**
 * Inline view + editor for a dataset's *custom* quick labels (the stored
 * quick_labels — not the checkpoint/inherited species). Used on the
 * Pre-Annotation screen so the user can see what's already been added and
 * edit it in place. Add labels via the shared manage modal; remove inline.
 */
export const DatasetCustomQuickLabels: React.FC<Props> = ({
  dataset,
  refreshSignal = 0,
}) => {
  const [labels, setLabels] = useState<QuickLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [managing, setManaging] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    datasetApi
      .getQuickLabels(Number(dataset.id))
      .then(setLabels)
      .catch(() => setLabels([]))
      .finally(() => setLoading(false));
  }, [dataset.id]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const removeLabel = async (taxonId: string) => {
    const next = labels.filter((l) => l.taxon_id !== taxonId);
    setRemovingId(taxonId);
    try {
      const saved = await datasetApi.putQuickLabels(Number(dataset.id), next);
      setLabels(saved);
    } catch {
      message.error("Failed to remove label");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          Custom labels ({labels.length})
        </Typography.Text>
        {loading && <Spin size="small" />}
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => setManaging(true)}
        >
          Manage
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!loading && labels.length === 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            No custom labels yet — add some via Manage, or freeze a conversation
            to add them here.
          </Typography.Text>
        )}
        {labels.map((l) => (
          <span
            key={l.taxon_id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              border: "1px solid #BFBFBF",
              borderRadius: 4,
              padding: "2px 8px",
              opacity: removingId === l.taxon_id ? 0.5 : 1,
            }}
          >
            <Tooltip title={l.taxon_id}>
              <span>{l.display_name}</span>
            </Tooltip>
            <CloseOutlined
              style={{
                fontSize: 10,
                color: "#ff4d4f",
                cursor: removingId ? "default" : "pointer",
              }}
              onClick={() => {
                if (!removingId) removeLabel(l.taxon_id);
              }}
            />
          </span>
        ))}
      </div>

      <DatasetQuickLabelsModal
        dataset={dataset}
        open={managing}
        onClose={() => setManaging(false)}
        onSaved={(saved) => setLabels(saved)}
      />
    </div>
  );
};
