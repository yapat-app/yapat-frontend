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
import { datasetApi, teamApi } from "../services/api";
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
  // Model-derived labels — present only when the dataset has a model (checkpoint).
  const inheritedNames = useInheritedQuickLabelNames(dataset.id);

  // Labels shown on the card. For a dataset that belongs to a team, these are
  // the team's ACTIVE label-space version (the versioned source of truth) — not
  // the flat, accumulated dataset.quick_labels. Teamless (admin-owned) datasets
  // keep the legacy quick_labels for now; the admin view is a later step.
  useEffect(() => {
    let cancelled = false;
    const apply = (labels: QuickLabel[]) => {
      if (!cancelled) setQuickLabels(labels);
    };
    const teamId = dataset.team_id;
    if (teamId != null) {
      Promise.all([
        teamApi.getActiveLabelSpace(teamId),
        datasetApi.getQuickLabels(Number(dataset.id)).catch(() => []),
      ])
        .then(([version, stored]) => {
          const versionLabels = (version?.taxonomy_data?.nodes ?? []).map(
            (n) => ({
              taxon_id: (n.taxon_id ?? n.id ?? "").toString(),
              display_name:
                n.canonical_name || n.scientific_name || n.name || "",
            }),
          );
          const versionKeys = new Set(versionLabels.map((l) => l.taxon_id));
          const cardAdded = (stored ?? []).filter(
            (l) => !versionKeys.has(l.taxon_id),
          );
          apply([...versionLabels, ...cardAdded]);
        })
        .catch(() => apply([]));
    } else {
      datasetApi
        .getQuickLabels(Number(dataset.id))
        .then(apply)
        .catch(() => apply([]));
    }
    return () => {
      cancelled = true;
    };
  }, [dataset.id, dataset.team_id]);

  const hasCustomLabels = quickLabels.length > 0;

  // Effective labels: model-derived (if a model exists) first, then the user's
  // custom labels, deduped by display name. No model → custom only.
  const customNameKeys = new Set(
    quickLabels.map((l) => l.display_name.trim().toLowerCase()),
  );
  const displayLabels: { key: string; display_name: string }[] = [
    ...inheritedNames
      .filter((n) => !customNameKeys.has(n.trim().toLowerCase()))
      .map((n) => ({ key: `model:${n}`, display_name: n })),
    ...quickLabels.map((l) => ({
      key: l.taxon_id,
      display_name: l.display_name,
    })),
  ];
  const hasAnyLabels = displayLabels.length > 0;

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

                {/* Quick Labels strip — model-derived (if any) + custom labels */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#888",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      marginRight: 4,
                    }}
                  >
                    ⚡ Quick Labels
                  </span>
                  {hasAnyLabels && (
                    <>
                      {displayLabels.slice(0, 5).map((l) => (
                        <Tag key={l.key} style={{ fontSize: 11, margin: 0 }}>
                          {l.display_name}
                        </Tag>
                      ))}
                      {displayLabels.length > 5 && (
                        <Tooltip
                          title={displayLabels
                            .slice(5)
                            .map((l) => l.display_name)
                            .join(", ")}
                        >
                          <Tag
                            style={{ fontSize: 11, margin: 0, color: "#888" }}
                          >
                            +{displayLabels.length - 5} more
                          </Tag>
                        </Tooltip>
                      )}
                    </>
                  )}
                  {hasCustomLabels ? (
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
                  ) : (
                    <Button
                      size="small"
                      type="link"
                      style={{ fontSize: 11, padding: 0, height: "auto" }}
                      onClick={() =>
                        navigate(`/pre-annotation?dataset_id=${dataset.id}`)
                      }
                    >
                      Add labels in Pre-Annotation
                    </Button>
                  )}
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
