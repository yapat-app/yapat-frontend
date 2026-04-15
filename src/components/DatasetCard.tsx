import type { Dataset } from "../types";
import { ExportAnnotationButton } from "./ExportAnnotation";
import { GenerateFeedModal } from "./GenerateFeed";
import { useAppSelector } from "../hooks";
import { GenerateEmbeddings } from "./GenerateEmbeddings";
import { Button } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

type DatasetCardProps = {
  dataset: Dataset;
};

export const DatasetCard: React.FC<DatasetCardProps> = ({ dataset }) => {
  const { datasetAnnotations } = useAppSelector(
    (state: any) => state.annotation,
  );
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  const handleStartAL = () => {
    navigate(`/active-learning?dataset_id=${dataset.id}`);
  };

  const datasetTypeLabel = (dataset.dataset_type ?? "PAM").replaceAll("_", " ");

  return (
    <div className="rounded-lg border border-amber-50 bg-white shadow-sm p-4 flex flex-col gap-4">
      {/* Header: name + description + Generate feed */}

      {datasetAnnotations.datasets
        ?.filter((d: any) => d.dataset_id === dataset.id)
        .map((d: any) => (
          <div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="sub_head_text">{dataset.name}</h2>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {datasetTypeLabel}
                  </span>
                </div>
                <p className="sub_base_text">Some description</p>
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                {datasetAnnotations.datasets && (
                  <ExportAnnotationButton
                    datasetId={dataset.id}
                    disabled={d.annotated_snippets < 1}
                  />
                )}
                {user && user.role === "admin" && (
                  <GenerateEmbeddings dataset={dataset} />
                )}
                <GenerateFeedModal datasetId={dataset.id} dataset={dataset} />
                <Button
                  icon={<ThunderboltOutlined />}
                  size="small"
                  type="primary"
                  style={{ backgroundColor: "#1e40af", borderColor: "#1e40af" }}
                  onClick={handleStartAL}
                  title="Start PAM Active Learning"
                >
                  Active Learning
                </Button>
              </div>
            </div>
            <div
              key={d.dataset_id}
              className="grid grid-cols-4 gap-3 text-center"
            >
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Audio files</p>
                <p className="text-lg font-semibold text-gray-600">
                  {dataset.recording_count}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Annotated</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {d.annotated_snippets}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Not annotated</p>
                <p className="text-lg font-semibold text-rose-600">
                  {d.not_annotated_snippets}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Completion</p>
                <p className="text-lg font-semibold text-indigo-600">
                  {d.annotation_percentage}%
                </p>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
};
