import { useCallback, useEffect, useState } from "react";
import type { Dataset, EmbeddingJobProgress, QuickLabel } from "../types";
import { ExportAnnotationButton } from "./ExportAnnotation";
import { GenerateFeedModal } from "./GenerateFeed";
import { useAppDispatch, useAppSelector } from "../hooks";
import { GenerateEmbeddings } from "./GenerateEmbeddings";
import { EmbeddingProgressPanel } from "./EmbeddingProgressPanel";
import { useEmbeddingJobStatus } from "../hooks/useEmbeddingJobStatus";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { Button, Tag, Tooltip, message } from "antd";
import { ThunderboltOutlined, TableOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { DatasetSpectrogramSettings } from "./DatasetSpectrogramSettings";
import { usePhaseConfig } from "../studyPhases";
import { DatasetQuickLabelsModal } from "./DatasetQuickLabelsModal";
import { DatasetMetadataModal } from "./DatasetMetadataModal";
import { datasetApi } from "../services/api";

type DatasetCardProps = {
  dataset: Dataset;
};

export const DatasetCard: React.FC<DatasetCardProps> = ({ dataset }) => {
  const { datasetAnnotations } = useAppSelector(
    (state: any) => state.annotation,
  );
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();

  // Embedding job tracking. The running job comes from GET /datasets
  // (`active_embedding_job`), which is how a refresh rediscovers it;
  // `startedJobId` covers the gap between creating a job and that refetch.
  const [startedJobId, setStartedJobId] = useState<number | null>(null);
  const activeJobId = dataset.is_ready_for_feed
    ? null
    : (dataset.active_embedding_job?.id ?? startedJobId);
  const onJobFinished = useCallback(
    (p: EmbeddingJobProgress) => {
      setStartedJobId(null);
      if (p.status === "completed") {
        message.success(`Embeddings ready for ${dataset.name}`);
      } else {
        message.error(
          `Embedding generation failed for ${dataset.name}${p.error_message ? `: ${p.error_message}` : ""}`,
        );
      }
      dispatch(fetchAllDatasets());
    },
    [dataset.name, dispatch],
  );
  const { progress: embeddingProgress, etaSeconds } = useEmbeddingJobStatus(
    activeJobId,
    onJobFinished,
  );

  const [quickLabels, setQuickLabels] = useState<QuickLabel[]>([]);
  const [managingLabels, setManagingLabels] = useState(false);
  const [managingMetadata, setManagingMetadata] = useState(false);

  useEffect(() => {
    datasetApi
      .getQuickLabels(Number(dataset.id))
      .then(setQuickLabels)
      .catch(() => setQuickLabels([]));
  }, [dataset.id]);

  const handleStartAL = () => {
    navigate(`/annotate?dataset_id=${dataset.id}&phase=${phase.id}`);
  };

  const datasetTypeLabel = (dataset.dataset_type ?? "PAM").replaceAll("_", " ");

  const stats = datasetAnnotations.datasets?.find(
    (d: any) => Number(d.dataset_id) === Number(dataset.id),
  );
  const statsReady = stats != null;

  const statPlaceholder = (
    <span className="inline-block h-6 w-16 animate-pulse rounded bg-gray-200 align-middle" />
  );

  return (
    <div className="rounded-lg border border-amber-50 bg-white shadow-sm p-4 flex flex-col gap-4">
      <div>
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
            <div className="mt-2">
              <DatasetSpectrogramSettings dataset={dataset} />
            </div>

            {/* Quick Labels strip */}
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
                  fontSize: "var(--text-fs-11)",
                  color: "#888",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  marginRight: 4,
                }}
              >
                ⚡ Quick Labels
              </span>
              {quickLabels.slice(0, 5).map((l) => (
                <Tag key={l.taxon_id} style={{ fontSize: "var(--text-fs-11)", margin: 0 }}>
                  {l.display_name}
                </Tag>
              ))}
              {quickLabels.length > 5 && (
                <Tooltip
                  title={quickLabels
                    .slice(5)
                    .map((l) => l.display_name)
                    .join(", ")}
                >
                  <Tag style={{ fontSize: "var(--text-fs-11)", margin: 0, color: "#888" }}>
                    +{quickLabels.length - 5} more
                  </Tag>
                </Tooltip>
              )}
              <Tag
                style={{
                  fontSize: "var(--text-fs-11)",
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
            <ExportAnnotationButton
              datasetId={dataset.id}
              disabled={!statsReady || stats.annotated_snippets < 1}
            />
            <Button
              icon={<TableOutlined />}
              onClick={() => setManagingMetadata(true)}
              title="Download the metadata template or upload metadata for this dataset's recordings"
            >
              Metadata
            </Button>
            <GenerateEmbeddings
              dataset={dataset}
              running={activeJobId != null}
              onStarted={setStartedJobId}
            />
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

        {activeJobId != null && (
          <div className="mb-3">
            <EmbeddingProgressPanel
              progress={embeddingProgress}
              etaSeconds={etaSeconds}
              recordingCount={dataset.recording_count}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <Tooltip title="Tap to view files">
            <div
              onClick={() => navigate(`/datasets/${dataset.id}/files`)}
              className="rounded-md bg-gray-50 px-3 py-2 cursor-pointer transition-colors hover:bg-gray-100"
            >
              <p className="text-xs text-gray-500">Audio files</p>
              <p className="text-lg font-semibold text-gray-600">
                {dataset.recording_count}
              </p>
            </div>
          </Tooltip>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Total snippets</p>
            <p className="text-lg font-semibold text-gray-700">
              {statsReady ? stats.total_snippets : statPlaceholder}
            </p>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Annotated snippets</p>
            <p className="text-lg font-semibold text-emerald-700">
              {statsReady
                ? `${stats.annotated_snippets} / ${stats.total_snippets}`
                : statPlaceholder}
            </p>
          </div>
        </div>
      </div>

      <DatasetQuickLabelsModal
        dataset={dataset}
        open={managingLabels}
        onClose={() => setManagingLabels(false)}
        onSaved={(saved) => setQuickLabels(saved)}
      />

      <DatasetMetadataModal
        dataset={dataset}
        open={managingMetadata}
        onClose={() => setManagingMetadata(false)}
      />
    </div>
  );
};
