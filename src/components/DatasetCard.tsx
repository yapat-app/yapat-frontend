import type { Dataset } from "../types";
import { ExportAnnotationButton } from "./ExportAnnotation";
import { GenerateFeedModal } from "./GenerateFeed";
import { useAppSelector } from "../hooks";
import { GenerateEmbeddings } from "./GenerateEmbeddings";

type DatasetCardProps = {
  dataset: Dataset;
};

export const DatasetCard: React.FC<DatasetCardProps> = ({ dataset }) => {
  const { datasetAnnotations } = useAppSelector(
    (state: any) => state.annotation,
  );
  const { user } = useAppSelector((state) => state.auth);
  return (
    <div className="rounded-lg border border-amber-50 bg-white shadow-sm p-4 flex flex-col gap-4">
      {/* Header: name + description + Generate feed */}

      {datasetAnnotations.datasets
        ?.filter((d: any) => d.dataset_id === dataset.id)
        .map((d: any) => (
          <div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div>
                <h2 className="sub_head_text">{dataset.name}</h2>
                <p className="sub_base_text">Some description</p>
                <p className="sub_base_text">
                  Audio Files: {dataset.recording_count}
                </p>
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
              </div>
            </div>
            <div
              key={d.dataset_id}
              className="grid grid-cols-3 gap-3 text-center"
            >
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
