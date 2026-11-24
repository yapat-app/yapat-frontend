import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { EmbeddingMethod, EmbeddingOption } from "../../types";
import {
  groupEmbeddingOptions,
  readyEmbeddingModelCount,
} from "../../utils/embeddingOptions";

type RowProps = { option: EmbeddingOption };

const ModelRow = ({ option }: RowProps) => (
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
      <span className="shrink-0 rounded bg-indigo-50 px-1.5 text-fs-11 font-medium text-indigo-700">
        In Annotate
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

/**
 * Shown when hovering "Embeddings ready": which models are ready, which one
 * Annotate uses, and which other models could still be generated here.
 */
export const EmbeddingModelsList = ({
  options,
  methods = [],
  canGenerate = false,
}: {
  options: EmbeddingOption[];
  /** Every model on the server; those with no job on this dataset are listed as not generated. */
  methods?: EmbeddingMethod[];
  /** Admins can start them from Generate Embeddings. */
  canGenerate?: boolean;
}) => {
  const groups = groupEmbeddingOptions(options);
  const ready = readyEmbeddingModelCount(options);
  const severalModels = groups.some((g) => g.shared) || groups.length > 1;
  const onDataset = new Set(options.map((o) => o.embedding_model_id));
  const notGenerated = methods.filter((m) => !onDataset.has(m.id));
  const anyAvailable = notGenerated.some((m) => m.weights_available !== false);

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
      {notGenerated.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-fs-11 font-semibold uppercase tracking-wide text-slate-600">
            Not generated yet
          </div>
          <div className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1">
            {notGenerated.map((m) => (
              <div key={m.id} className="flex min-h-8 items-center gap-2 text-slate-500">
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-slate-400"
                />
                <span className="min-w-0 text-[13px] font-medium">
                  {m.name} {m.version}
                </span>
                <span className="ml-auto shrink-0 text-xs">
                  {m.weights_available === false
                    ? "Not available on this server"
                    : `${m.window_size} s snippets`}
                </span>
              </div>
            ))}
          </div>
          {anyAvailable && (
            <div className="text-xs text-slate-500">
              {canGenerate
                ? "Use Generate Embeddings to add one."
                : "An admin can generate embeddings for these."}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
