import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { EmbeddingOption } from "../../types";
import {
  groupEmbeddingOptions,
  readyEmbeddingModelCount,
} from "../../utils/embeddingOptions";

const ModelRow = ({ option }: { option: EmbeddingOption }) => (
  <div className="flex min-h-8 items-center gap-2">
    {option.status === "completed" ? (
      <CheckCircleOutlined aria-hidden className="text-emerald-600" />
    ) : option.status === "failed" ? (
      <CloseCircleOutlined aria-hidden className="text-red-600" />
    ) : (
      <LoadingOutlined aria-hidden className="text-orange-600" />
    )}
    <span className="min-w-0 text-[13px] font-medium text-slate-900">
      {option.name} {option.version}
    </span>
    {option.is_default && (
      <span className="shrink-0 rounded bg-slate-200 px-1.5 text-fs-11 text-slate-700">
        Default
      </span>
    )}
    <span
      className={`ml-auto shrink-0 text-xs ${
        option.status === "completed"
          ? "text-slate-600"
          : option.status === "failed"
            ? "font-medium text-red-700"
            : "font-medium text-orange-800"
      }`}
    >
      {option.status === "completed"
        ? `${option.window_size} s snippets`
        : option.status === "failed"
          ? "Failed"
          : "Generating"}
    </span>
  </div>
);

/** Shown when hovering "Embeddings ready": which models are ready. */
export const EmbeddingModelsList = ({ options }: { options: EmbeddingOption[] }) => {
  const groups = groupEmbeddingOptions(options);
  const ready = readyEmbeddingModelCount(options);
  const severalModels = groups.some((g) => g.shared) || groups.length > 1;

  return (
    <div className="flex w-[310px] max-w-full flex-col gap-3 font-ibm-sans">
      <div className="text-sm font-semibold text-slate-900">
        Embeddings ready for {ready} model{ready === 1 ? "" : "s"}
      </div>
      {groups.map((group) => (
        <div key={group.snippetSetId} className="flex flex-col gap-1.5">
          {severalModels && (
            <div className="text-fs-11 font-semibold uppercase tracking-wide text-slate-600">
              {group.shared ? "Shared" : "Separate"} snippets and labels
            </div>
          )}
          <div className="rounded-lg bg-slate-50 px-2.5 py-1">
            {group.options.map((option) => (
              <ModelRow key={option.embedding_model_id} option={option} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
