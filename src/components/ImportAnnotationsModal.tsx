import React, { useState } from "react";
import { Modal, Button, Upload, Alert, Typography, Space, message } from "antd";
import {
  InboxOutlined,
  EyeOutlined,
  CheckOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import type {
  Dataset,
  AnnotationImportPreview,
  AnnotationImportResult,
  AnnotationImportStatus,
  AnnotationImportLabel,
} from "../types";
import { datasetApi } from "../services/api";
import { SCROLL_MODAL_PROPS } from "./datasets/modalLayout";

type Props = {
  dataset: Dataset;
  open: boolean;
  onClose: () => void;
  /** After a successful import (e.g. to refresh the annotated counts). */
  onImported?: () => void;
};

type Step = "select" | "preview" | "done";

const { Dragger } = Upload;
const { Paragraph, Text } = Typography;

/** Small status dot shown next to a count's label. */
const STATUS_DOT: Record<AnnotationImportStatus, string> = {
  will_import: "bg-emerald-500",
  already_exist: "bg-slate-400",
  no_match: "bg-amber-500",
  invalid: "bg-red-500",
};

/** Small uppercase caption, as on the dataset page tiles. */
const CAPTION =
  "text-fs-11 font-semibold uppercase tracking-wider text-slate-600 font-ibm-sans";

/**
 * A stat tile used in the summary rows. With `onClick` it is a button that
 * selects the list of rows behind the number. The selected outline is drawn
 * inside the tile so the window's scroll area cannot clip it.
 */
const StatCard: React.FC<{
  label: string;
  value: number;
  dot?: string;
  valueClass?: string;
  selected?: boolean;
  onClick?: () => void;
}> = ({ label, value, dot, valueClass, selected = false, onClick }) => {
  const content = (
    <>
      <div className={`flex items-center justify-center gap-1.5 ${CAPTION}`}>
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </div>
      <div
        className={`mt-1.5 font-ibm-mono text-2xl font-semibold ${
          valueClass ?? (value === 0 ? "text-slate-400" : "text-slate-900")
        }`}
      >
        {value.toLocaleString()}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={value === 0}
      className={`rounded-lg border px-3 py-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default ${
        selected
          ? "border-blue-500 bg-blue-50 ring-1 ring-inset ring-blue-500"
          : "border-slate-200 bg-white enabled:cursor-pointer enabled:hover:border-slate-300 enabled:hover:bg-slate-50"
      }`}
    >
      {content}
    </button>
  );
};

/** Wording and reason colour of the row list for each kind of row. */
const LIST_META: Record<
  AnnotationImportStatus,
  { title: string; reason: string }
> = {
  will_import: { title: "will be imported", reason: "text-slate-500" },
  already_exist: {
    title: "are already in this dataset or repeat an earlier row",
    reason: "text-slate-400",
  },
  no_match: {
    title: "have no matching recording or snippet in this dataset",
    reason: "text-amber-700",
  },
  invalid: {
    title: "have missing or unusable values",
    reason: "text-red-700",
  },
};

/** Label chips shown before "+N more" expands the rest. */
const LABELS_COLLAPSED = 8;

const labelText = (l: AnnotationImportLabel) =>
  l.name || l.taxon_id || "(no species)";

/** The list opened first: what will be imported, else the first problem. */
const firstNonEmpty = (p: AnnotationImportPreview): AnnotationImportStatus => {
  const order: AnnotationImportStatus[] = [
    "will_import",
    "no_match",
    "invalid",
    "already_exist",
  ];
  return order.find((status) => p[status] > 0) ?? "will_import";
};

/**
 * Import annotations into a dataset from a file made by Export, in three steps:
 *  1. select   — pick the CSV / JSON file.
 *  2. preview  — dry-run: show how many rows will be added, already exist,
 *                have no matching snippet or are invalid, with reasons.
 *  3. done     — import summary.
 * Backend: datasetApi.previewAnnotationImport / importAnnotations.
 */
export const ImportAnnotationsModal: React.FC<Props> = ({
  dataset,
  open,
  onClose,
  onImported,
}) => {
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AnnotationImportPreview | null>(null);
  const [result, setResult] = useState<AnnotationImportResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** Which row list the preview shows (chosen by clicking a count). */
  const [shown, setShown] = useState<AnnotationImportStatus>("will_import");
  /** Species the row list is narrowed to (taxon id), or null for all. */
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [showAllLabels, setShowAllLabels] = useState(false);

  const selectList = (status: AnnotationImportStatus) => {
    setShown(status);
    setLabelFilter(null);
    setShowAllLabels(false);
  };

  const reset = () => {
    setStep("select");
    setFile(null);
    setBusy(false);
    setPreview(null);
    setResult(null);
    setErrorText(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  /** Back to step 1 with the previous file cleared, ready for a different one. */
  const chooseDifferentFile = () => {
    setStep("select");
    setPreview(null);
    setResult(null);
    setErrorText(null);
    setFile(null);
  };

  /** Back to step 1 keeping the current file. */
  const backToSelect = () => {
    setStep("select");
    setPreview(null);
    setErrorText(null);
  };

  const readError = (e: unknown, fallback: string): string => {
    const err = e as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = err?.response?.data?.detail ?? err?.message ?? fallback;
    return typeof detail === "string" ? detail : fallback;
  };

  const handlePreview = async () => {
    if (!file) return;
    setBusy(true);
    setErrorText(null);
    try {
      const res = await datasetApi.previewAnnotationImport(
        Number(dataset.id),
        file,
      );
      setPreview(res);
      selectList(firstNonEmpty(res));
      setStep("preview");
    } catch (e: unknown) {
      setErrorText(readError(e, "Could not read the file. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setBusy(true);
    setErrorText(null);
    try {
      const res = await datasetApi.importAnnotations(Number(dataset.id), file);
      onImported?.();
      setResult(res);
      setStep("done");
      message.success("Annotations imported");
    } catch (e: unknown) {
      setErrorText(readError(e, "Import failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const uploadFileList: UploadFile[] = file
    ? [{ uid: "1", name: file.name, status: "done" }]
    : [];

  const renderSelect = () => (
    <>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Add labelled snippets to <Text strong>{dataset.name}</Text> from a file
        made by Export. Each row is matched to a snippet by its recording file
        name and start and end time. New labels are added next to the ones
        already there, and rows that do not match are skipped.
      </Paragraph>

      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Required columns: <Text code>recording_file_name</Text>,{" "}
        <Text code>snippet_start_time</Text>,{" "}
        <Text code>snippet_end_time</Text> and <Text code>taxon_id</Text>.
      </Paragraph>

      <Dragger
        accept=".csv,.json,text/csv,application/json"
        multiple={false}
        maxCount={1}
        fileList={uploadFileList}
        beforeUpload={(f) => {
          const name = f.name.toLowerCase();
          if (!name.endsWith(".csv") && !name.endsWith(".json")) {
            message.error("Please select a .csv or .json file");
            return Upload.LIST_IGNORE;
          }
          setFile(f);
          setErrorText(null);
          return false; // prevent antd auto-upload; we POST manually
        }}
        onRemove={() => {
          setFile(null);
          return true;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          Click or drag your annotations file here
        </p>
        <p className="ant-upload-hint">CSV or JSON, as downloaded from Export.</p>
      </Dragger>

      <Space style={{ marginTop: 16 }}>
        <Button
          type="primary"
          icon={<EyeOutlined />}
          disabled={!file}
          loading={busy}
          onClick={handlePreview}
        >
          Preview import
        </Button>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
      </Space>
    </>
  );

  const renderPreview = () => {
    if (!preview) return null;
    // Rows are numbered as in the file: the line of a CSV (the header is line
    // 1, as in a spreadsheet), the position in a JSON list.
    const isJson = !!file?.name.toLowerCase().endsWith(".json");
    const rowWord = isJson ? "Item" : "Row";
    const skipped = preview.no_match + preview.invalid;
    const nothingToImport = preview.will_import === 0;

    return (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {preview.total_rows.toLocaleString()} {isJson ? "items" : "rows"} in
          the file
          {isJson
            ? ", numbered from 1."
            : ", numbered as in a spreadsheet (the header is row 1)."}{" "}
          Review what will change before importing. Nothing has been saved yet.
        </Paragraph>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Will import"
            value={preview.will_import}
            dot={STATUS_DOT.will_import}
            selected={shown === "will_import"}
            onClick={() => selectList("will_import")}
          />
          <StatCard
            label="Already exist"
            value={preview.already_exist}
            dot={STATUS_DOT.already_exist}
            selected={shown === "already_exist"}
            onClick={() => selectList("already_exist")}
          />
          <StatCard
            label="No match"
            value={preview.no_match}
            dot={STATUS_DOT.no_match}
            selected={shown === "no_match"}
            onClick={() => selectList("no_match")}
          />
          <StatCard
            label="Invalid"
            value={preview.invalid}
            dot={STATUS_DOT.invalid}
            selected={shown === "invalid"}
            onClick={() => selectList("invalid")}
          />
        </div>

        {(() => {
          const meta = LIST_META[shown];
          const labels = preview.labels
            .filter((l) => l[shown] > 0)
            .sort((a, b) => b[shown] - a[shown]);
          const active = labels.find((l) => l.taxon_id === labelFilter);
          const total = active ? active[shown] : preview[shown];
          const listed = preview.rows.filter(
            (r) => r.status === shown && (!active || r.taxon_id === active.taxon_id),
          );
          const visibleLabels = showAllLabels
            ? labels
            : labels.slice(0, LABELS_COLLAPSED);
          const hiddenLabels = labels.length - LABELS_COLLAPSED;
          return (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[shown]}`}
                />
                <span className="text-sm font-semibold text-slate-800">
                  {total.toLocaleString()} row(s) {meta.title}
                  {active && <> for {labelText(active)}</>}
                </span>
                {active && (
                  <button
                    type="button"
                    onClick={() => setLabelFilter(null)}
                    className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {labels.length > 0 && (
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <div className={`mb-2 flex flex-wrap items-baseline gap-x-2 ${CAPTION}`}>
                    Labels · {labels.length.toLocaleString()}
                    <span className="text-xs font-normal normal-case tracking-normal text-slate-400">
                      Select one to filter the rows
                    </span>
                  </div>
                  <div
                    className={`flex flex-wrap gap-1.5 ${
                      showAllLabels ? "max-h-28 overflow-y-auto" : ""
                    }`}
                  >
                    {visibleLabels.map((l) => {
                      const on = l.taxon_id === labelFilter;
                      return (
                        <button
                          key={l.taxon_id || "(none)"}
                          type="button"
                          aria-pressed={on}
                          title={l.taxon_id}
                          onClick={() =>
                            setLabelFilter(on ? null : l.taxon_id)
                          }
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium leading-none focus-visible:outline-2 focus-visible:outline-blue-500 ${
                            on
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          {labelText(l)}
                          <span className="font-normal text-slate-400">
                            {l[shown].toLocaleString()}
                          </span>
                        </button>
                      );
                    })}
                    {hiddenLabels > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllLabels((v) => !v)}
                        className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium leading-none text-blue-600 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-500"
                      >
                        {showAllLabels
                          ? "Show fewer"
                          : `+${hiddenLabels.toLocaleString()} more`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto px-3">
                {listed.length === 0 ? (
                  <div className="py-3 text-xs text-slate-400">No rows.</div>
                ) : (
                  <ul className="m-0 list-none divide-y divide-slate-100 p-0">
                    {listed.map((r) => (
                      <li key={r.row} className="py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 break-all text-xs font-medium text-slate-800">
                            {r.recording}
                          </span>
                          <span className="shrink-0 font-ibm-mono text-fs-10 text-slate-400">
                            {rowWord} {r.row}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.start}–{r.end} s ·{" "}
                          {r.name ? `${r.name} (${r.taxon_id})` : r.taxon_id}
                        </div>
                        {r.reason && (
                          <div className={`mt-0.5 text-xs ${meta.reason}`}>
                            {r.reason}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {total > listed.length && (
                  <div className="border-t border-slate-100 py-2 text-xs text-slate-400">
                    Showing the first {listed.length.toLocaleString()} of{" "}
                    {total.toLocaleString()}.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {nothingToImport && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              skipped > 0
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {skipped > 0
              ? "No rows can be imported. Check that the recording file names and snippet times match this dataset, then upload a corrected file."
              : "Everything in this file is already in the dataset."}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          {nothingToImport ? (
            <Button
              type="primary"
              icon={<InboxOutlined />}
              onClick={chooseDifferentFile}
              disabled={busy}
            >
              Upload a different file
            </Button>
          ) : (
            <>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={backToSelect}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={busy}
                onClick={handleConfirm}
              >
                Import {preview.will_import.toLocaleString()} annotations
              </Button>
            </>
          )}
        </div>
      </>
    );
  };

  const renderDone = () => {
    if (!result) return null;
    const notImported = result.total_rows - result.imported;
    return (
      <>
        <Alert
          type="success"
          showIcon
          message="Import complete"
          description="The annotations have been added to the matching snippets."
        />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatCard label="Rows read" value={result.total_rows} />
          <StatCard
            label="Imported"
            value={result.imported}
            valueClass="text-emerald-600"
          />
          <StatCard label="Not imported" value={notImported} />
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={reset}>Import another</Button>
          <Button type="primary" onClick={handleClose}>
            Done
          </Button>
        </div>
      </>
    );
  };

  return (
    <Modal
      {...SCROLL_MODAL_PROPS}
      title="Import annotations"
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnClose
      width={640}
    >
      {step === "select" && renderSelect()}
      {step === "preview" && renderPreview()}
      {step === "done" && renderDone()}
      {errorText && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message="Something went wrong"
          description={errorText}
        />
      )}
    </Modal>
  );
};
