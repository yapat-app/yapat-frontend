/**
 * One-way label transfer into the hub's model (admins and team owners).
 *
 * The labels on another model's clips go onto this model's overlapping clips:
 * copied where they must hold, suggested for review otherwise. Which way the
 * labels flow matters: a label on a short clip that lies inside a longer one
 * copies directly, while a label on a long clip can't say where in it the call
 * is, so going from long clips to short ones mostly yields suggestions.
 */
import React, { useMemo, useState } from "react";
import { Modal, Select } from "antd";
import {
  ArrowDownOutlined,
  BulbOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { EmbeddingOption } from "../../types";

const fmt = new Intl.NumberFormat();

/** One snippet set: the models that use its clips. */
type ClipSource = {
  snippetSetId: number;
  /** The model the request names; any model of the set maps to the set. */
  modelId: number;
  name: string;
  windowS: number;
  labelled: number | null;
};

function modelName(o: EmbeddingOption): string {
  return `${o.name.charAt(0).toUpperCase()}${o.name.slice(1)} ${o.version}`;
}

function groupBySet(
  options: EmbeddingOption[],
  labelledBySet: Record<string, number> | null,
): ClipSource[] {
  const sets = new Map<number, EmbeddingOption[]>();
  for (const o of options) {
    if (o.status !== "completed") continue;
    sets.set(o.snippet_set_id, [...(sets.get(o.snippet_set_id) ?? []), o]);
  }
  return [...sets.entries()].map(([snippetSetId, models]) => ({
    snippetSetId,
    modelId: models[0].embedding_model_id,
    name: models.map(modelName).join(" / "),
    windowS: models[0].window_size,
    labelled: labelledBySet ? (labelledBySet[String(snippetSetId)] ?? 0) : null,
  }));
}

/** Which source to offer first: labelled, shortest clips, then most labels. */
function pickDefault(sources: ClipSource[]): ClipSource | null {
  const ranked = [...sources].sort(
    (a, b) =>
      Number((b.labelled ?? 1) > 0) - Number((a.labelled ?? 1) > 0) ||
      a.windowS - b.windowS ||
      (b.labelled ?? 0) - (a.labelled ?? 0),
  );
  return ranked[0] ?? null;
}

/** Two rows of clips on a shared time axis, so the overlap is visible. */
const ClipGrid: React.FC<{ fromS: number; intoS: number }> = ({
  fromS,
  intoS,
}) => {
  const span = 3 * Math.max(fromS, intoS);
  const row = (windowS: number, tone: string) => {
    const clips: number[] = [];
    for (let t = 0; t + windowS <= span + 1e-6; t += windowS) clips.push(t);
    return (
      <div className="relative h-3.5">
        {clips.map((t) => (
          <div
            key={t}
            className={`absolute top-0 h-full rounded-sm border ${tone}`}
            style={{
              left: `${(t / span) * 100}%`,
              width: `calc(${(windowS / span) * 100}% - 2px)`,
            }}
          />
        ))}
      </div>
    );
  };
  return (
    <div
      className="grid grid-cols-[48px_1fr] items-center gap-x-2 gap-y-1 font-ibm-sans text-fs-10 text-gray-500"
      aria-hidden
    >
      <span>From {fromS} s</span>
      {row(fromS, "border-gray-400 bg-gray-200")}
      <span>Into {intoS} s</span>
      {row(intoS, "border-blue-400 bg-blue-100")}
    </div>
  );
};

type Props = {
  open: boolean;
  onClose: () => void;
  options: EmbeddingOption[];
  currentModelId: number | null;
  labelledBySet: Record<string, number> | null;
  onTransfer: (fromModelId: number, fromName: string) => void;
};

export const TransferLabelsDialog: React.FC<Props> = ({
  open,
  onClose,
  options,
  currentModelId,
  labelledBySet,
  onTransfer,
}) => {
  const all = useMemo(
    () => groupBySet(options, labelledBySet),
    [options, labelledBySet],
  );
  const into = useMemo(() => {
    const set = options.find(
      (o) => o.embedding_model_id === currentModelId,
    )?.snippet_set_id;
    return all.find((s) => s.snippetSetId === set) ?? null;
  }, [all, options, currentModelId]);
  const sources = useMemo(
    () => all.filter((s) => s.snippetSetId !== into?.snippetSetId),
    [all, into],
  );
  const [pickedSetId, setPickedSetId] = useState<number | null>(null);
  const from =
    sources.find((s) => s.snippetSetId === pickedSetId) ?? pickDefault(sources);

  if (!into) return null;

  const longToShort = !!from && from.windowS > into.windowS;
  const shorterSource = sources
    .filter(
      (s) =>
        s !== from &&
        s.windowS <= into.windowS &&
        (s.labelled === null || s.labelled > 0),
    )
    .sort((a, b) => a.windowS - b.windowS)[0];
  const intoHasLabels = (into.labelled ?? 0) > 0;
  const nothingToMove = from?.labelled === 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Transfer labels"
      okText={
        from?.labelled
          ? `Transfer ${fmt.format(from.labelled)} labelled snippets`
          : "Transfer labels"
      }
      okButtonProps={{ disabled: !from || nothingToMove }}
      onOk={() => {
        if (!from) return;
        onTransfer(from.modelId, from.name);
        onClose();
      }}
      width={460}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3 font-ibm-sans">
        <div className="flex flex-col gap-1">
          <span className="text-fs-11 font-semibold uppercase tracking-wider text-gray-500">
            From
          </span>
          <Select
            value={from?.snippetSetId}
            onChange={(v) => setPickedSetId(v)}
            options={sources.map((s) => ({
              value: s.snippetSetId,
              disabled: s.labelled === 0,
              label: (
                <span className="flex items-center justify-between gap-3">
                  <span>
                    {s.name}
                    <span className="text-gray-400">
                      {" "}
                      · {s.windowS} s snippets
                    </span>
                  </span>
                  {s.labelled !== null && (
                    <span className="font-ibm-mono text-fs-11 tabular-nums text-gray-500">
                      {fmt.format(s.labelled)} labelled
                    </span>
                  )}
                </span>
              ),
            }))}
            className="w-full"
          />
        </div>

        <ArrowDownOutlined className="self-center text-gray-300" />

        <div className="flex flex-col gap-1">
          <span className="text-fs-11 font-semibold uppercase tracking-wider text-gray-500">
            Into (the model you're annotating with)
          </span>
          <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800">
            <span>
              {into.name}
              <span className="text-gray-400">
                {" "}
                · {into.windowS} s snippets
              </span>
            </span>
          </div>
        </div>

        {from && <ClipGrid fromS={from.windowS} intoS={into.windowS} />}

        {from &&
          (longToShort ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
              <BulbOutlined className="mt-0.5 text-amber-600" />
              <div className="flex flex-col gap-1">
                <span>
                  {from.name}'s snippets ({from.windowS} s) are longer than this
                  model's ({into.windowS} s). A {from.windowS} s label doesn't
                  say where in the snippet the call is, so species labels arrive
                  as suggestions to review rather than copies.
                </span>
                {shorterSource ? (
                  <button
                    type="button"
                    onClick={() => setPickedSetId(shorterSource.snippetSetId)}
                    className="cursor-pointer self-start p-0 text-left font-medium text-amber-900 underline underline-offset-2"
                  >
                    Transfer from {shorterSource.name} ({shorterSource.windowS}{" "}
                    s snippets) instead to copy more directly.
                  </button>
                ) : (
                  intoHasLabels && (
                    <span className="font-medium">
                      Labels go across more easily from shorter snippets to
                      longer ones: switch the hub to {from.name} and transfer
                      this model's labels into it.
                    </span>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-snug text-emerald-900">
              <CheckCircleOutlined className="mt-0.5 text-emerald-600" />
              <span>
                {from.windowS < into.windowS
                  ? `Labels on ${from.windowS} s snippets that lie inside a ${into.windowS} s snippet are copied directly. Only snippets across a boundary become suggestions to review.`
                  : "Labels are copied where the snippets line up. The rest become suggestions to review."}
              </span>
            </div>
          ))}

        <p className="m-0 text-fs-11 leading-snug text-gray-500">
          Labels already on a snippet are skipped, so this is safe to run again.
          Reviewing suggestions is optional: until you accept one, its snippet
          counts as unlabeled.
        </p>
      </div>
    </Modal>
  );
};

TransferLabelsDialog.displayName = "TransferLabelsDialog";
