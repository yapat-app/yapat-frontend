import type { Dataset } from "../types";
import { ExportAnnotationButton } from "./ExportAnnotation";
import { GenerateFeedModal } from "./GenerateFeed";

type DatasetCardProps = {
  dataset: Dataset;
};

export const DatasetCard: React.FC<DatasetCardProps> = ({ dataset }) => {
  return (
    <div className="rounded-lg border border-amber-50 bg-white shadow-sm p-4 flex flex-col gap-4">
      {/* Header: name + description + Generate feed */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="sub_head_text">{dataset.name}</h2>
          <p className="sub_base_text">Some description</p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          <ExportAnnotationButton datasetId={dataset.id} />
          <GenerateFeedModal datasetId={parseInt(dataset.id, 10)} />
        </div>
      </div>

      {/* Annotation stats */}
      {/* <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Annotated</p>
            <p className="text-lg font-semibold text-emerald-600">120</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Not annotated</p>
            <p className="text-lg font-semibold text-rose-600">30</p>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Completion</p>
            <p className="text-lg font-semibold text-indigo-600">80%</p>
            </div>
        </div> */}
    </div>
  );
};
