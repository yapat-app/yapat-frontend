import { useEffect, useState } from "react";
import type { Dataset, QuickLabel } from "../types";
import { ExportAnnotationButton } from "./ExportAnnotation";
import { GenerateFeedModal } from "./GenerateFeed";
import { useAppSelector } from "../hooks";
import { GenerateEmbeddings } from "./GenerateEmbeddings";
import { Button, Tag, Tooltip } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { DatasetSpectrogramSettings } from "./DatasetSpectrogramSettings";
import { DatasetRetrainThresholdSettings } from "./DatasetRetrainThresholdSettings";
import { DatasetQuickLabelsModal } from "./DatasetQuickLabelsModal";
import { datasetApi } from "../services/api";
import { useInheritedQuickLabelNames } from "../hooks/useInheritedQuickLabelNames";

type DatasetCardProps = {
  dataset: Dataset;
};

export const DatasetCard: React.FC<DatasetCardProps> = ({ dataset }) => {
  const { datasetAnnotations } = useAppSelector(
    (state: any) => state.annotation,
  );
  const navigate = useNavigate();

  const [quickLabels, setQuickLabels] = useState<QuickLabel[]>([]);
  const [managingLabels, setManagingLabels] = useState(false);
  // Model/checkpoint-derived labels that stored quick_labels extend (not replace).
  const inheritedNames = useInheritedQuickLabelNames(dataset.id);

  useEffect(() => {
    datasetApi
      .getQuickLabels(Number(dataset.id))
      .then(setQuickLabels)
      .catch(() => setQuickLabels([]));
  }, [dataset.id]);

  // Effective quick labels shown to annotators: inherited model labels first,
  // then the dataset's stored labels, deduped by display name.
  const storedNameKeys = new Set(
    quickLabels.map((l) => l.display_name.trim().toLowerCase()),
  );
  const mergedLabels: { key: string; display_name: string }[] = [
    ...inheritedNames
      .filter((n) => !storedNameKeys.has(n.trim().toLowerCase()))
      .map((n) => ({ key: `ckpt:${n}`, display_name: n })),
    ...quickLabels.map((l) => ({ key: l.taxon_id, display_name: l.display_name })),
  ];

  const handleStartAL = () => {
    navigate(`/annotate?mode=al&dataset_id=${dataset.id}`);
  };

  const datasetTypeLabel = (dataset.dataset_type ?? "PAM").replaceAll("_", " ");

  return (
    <div className="rounded-lg border border-amber-50 bg-white shadow-sm p-4 flex flex-col gap-4">
      {datasetAnnotations.datasets
        ?.filter((d: any) => d.dataset_id === dataset.id)
        .map((d: any) => (
          <div key={d.dataset_id}>
            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="sub_head_text">{dataset.name}</h2>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {datasetTypeLabel}
                  </span>
                </div>
                <p className="sub_base_text">
                  {dataset.description?.trim() ? dataset.description : "—"}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  <DatasetSpectrogramSettings dataset={dataset} />
                  {(dataset.dataset_type ?? "PAM") === "PAM" && (
                    <DatasetRetrainThresholdSettings dataset={dataset} />
                  )}
                </div>

                {/* Quick Labels strip */}
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", marginRight: 4 }}>
                    ⚡ Quick Labels
                  </span>
                  {mergedLabels.slice(0, 5).map((l) => (
                    <Tag key={l.key} style={{ fontSize: 11, margin: 0 }}>
                      {l.display_name}
                    </Tag>
                  ))}
                  {mergedLabels.length > 5 && (
                    <Tooltip title={mergedLabels.slice(5).map((l) => l.display_name).join(", ")}>
                      <Tag style={{ fontSize: 11, margin: 0, color: "#888" }}>
                        +{mergedLabels.length - 5} more
                      </Tag>
                    </Tooltip>
                  )}
                  <Tag
                    style={{
                      fontSize: 11,
                      margin: 0,
                      cursor: "pointer",
                      color: "#1890ff",
                      borderColor: "#1890ff",
                      borderStyle: "dashed",
                    }}
                    onClick={() => setManagingLabels(true)}
                  >
                    Manage
                  </Tag>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                {datasetAnnotations.datasets && (
                  <ExportAnnotationButton
                    datasetId={dataset.id}
                    disabled={d.annotated_snippets < 1}
                  />
                )}
                <GenerateEmbeddings dataset={dataset} />
                <GenerateFeedModal datasetId={dataset.id} dataset={dataset} />
                <Button
                  icon={<ThunderboltOutlined />}
                  size="small"
                  type="primary"
                  style={{
                    backgroundColor: "#1e40af",
                    borderColor: "#1e40af",
                    color: "#fff",
                  }}
                  onClick={handleStartAL}
                  title="Start PAM Active Learning"
                >
                  Active Learning
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Audio files</p>
                <p className="text-lg font-semibold text-gray-600">
                  {dataset.recording_count}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Total snippets</p>
                <p className="text-lg font-semibold text-gray-700">
                  {d.total_snippets}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Annotated snippets</p>
                <p className="text-lg font-semibold text-emerald-700">
                  {d.annotated_snippets} / {d.total_snippets}
                </p>
              </div>
            </div>
          </div>
        ))}

      <DatasetQuickLabelsModal
        dataset={dataset}
        open={managingLabels}
        onClose={() => setManagingLabels(false)}
        onSaved={(saved) => setQuickLabels(saved)}
      />
    </div>
  );
};
