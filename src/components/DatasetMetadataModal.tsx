import React, { useState } from "react";
import {
  Modal,
  Button,
  Upload,
  Alert,
  Typography,
  Space,
  Input,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  DownloadOutlined,
  InboxOutlined,
  EyeOutlined,
  CheckOutlined,
  ArrowLeftOutlined,
  EnvironmentOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import type {
  Dataset,
  RecordingMetadataPreview,
  RecordingMetadataImportResult,
} from "../types";
import { datasetApi } from "../services/api";
import { downloadRecordingMetadataTemplate } from "../constants/recordingMetadata";
import { invalidateRecordingMetadataCache } from "../pages/annotationHub/useRecordingMetadata";

type Props = {
  dataset: Dataset;
  open: boolean;
  onClose: () => void;
};

type Step = "select" | "preview" | "done";

const { Dragger } = Upload;
const { Paragraph, Text } = Typography;

type StatTone = "neutral" | "green" | "amber";

const STAT_VALUE_CLASS: Record<StatTone, string> = {
  neutral: "text-gray-800",
  green: "text-emerald-600",
  amber: "text-amber-600",
};

/** A single bordered stat tile used in the preview summary row. */
const StatCard: React.FC<{
  label: string;
  value: number;
  tone?: StatTone;
  sub?: string;
}> = ({ label, value, tone = "neutral", sub }) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center">
    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {label}
    </div>
    <div className={`mt-1 text-2xl font-semibold ${STAT_VALUE_CLASS[tone]}`}>
      {value.toLocaleString()}
    </div>
    <div className="mt-0.5 h-4 text-xs text-gray-400">{sub ?? ""}</div>
  </div>
);

/**
 * Recording-metadata import for a dataset, in three steps:
 *  1. select   — download the template, pick a filled CSV.
 *  2. preview  — dry-run: show match counts + distinct locations, let the user
 *                rename locations, then confirm.
 *  3. done     — import summary.
 * The two backend endpoints (preview + import) are still TODO — see
 * datasetApi.previewRecordingMetadata / uploadRecordingMetadata.
 */
export const DatasetMetadataModal: React.FC<Props> = ({
  dataset,
  open,
  onClose,
}) => {
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RecordingMetadataPreview | null>(null);
  const [result, setResult] = useState<RecordingMetadataImportResult | null>(
    null,
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  /** original CSV location -> user's replacement (only changed entries kept). */
  const [locationRenames, setLocationRenames] = useState<
    Record<string, string>
  >({});

  const reset = () => {
    setStep("select");
    setFile(null);
    setBusy(false);
    setPreview(null);
    setResult(null);
    setErrorText(null);
    setLocationRenames({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  /** Back to step 1 with the previous file cleared, ready for a different CSV. */
  const chooseDifferentFile = () => {
    setStep("select");
    setPreview(null);
    setResult(null);
    setErrorText(null);
    setLocationRenames({});
    setFile(null);
  };

  /** Back to step 1 keeping the current file (e.g. to re-preview after edits). */
  const backToSelect = () => {
    setStep("select");
    setPreview(null);
    setErrorText(null);
  };

  const readError = (e: any, fallback: string): string => {
    const detail = e?.response?.data?.detail ?? e?.message ?? fallback;
    return typeof detail === "string" ? detail : fallback;
  };

  const handlePreview = async () => {
    if (!file) return;
    setBusy(true);
    setErrorText(null);
    try {
      const res = await datasetApi.previewRecordingMetadata(
        Number(dataset.id),
        file,
      );
      setPreview(res);
      setLocationRenames({});
      setStep("preview");
    } catch (e: any) {
      setErrorText(readError(e, "Could not read the CSV. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setBusy(true);
    setErrorText(null);
    // Keep only entries the user actually changed to a non-empty value.
    const overrides: Record<string, string> = {};
    for (const [orig, next] of Object.entries(locationRenames)) {
      const trimmed = next.trim();
      if (trimmed && trimmed !== orig) overrides[orig] = trimmed;
    }
    try {
      const res = await datasetApi.uploadRecordingMetadata(
        Number(dataset.id),
        file,
        overrides,
      );
      // The location / date-time filters read a cached recordings scan; drop it
      // so they pick up the freshly-imported extra_metadata without a reload.
      invalidateRecordingMetadataCache(Number(dataset.id));
      setResult(res);
      setStep("done");
      message.success("Metadata imported");
    } catch (e: any) {
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
        Add metadata (date/time, location, coordinates) to the recordings in{" "}
        <Text strong>{dataset.name}</Text>. Download the template, fill one row
        per recording, then upload it. Rows are matched to recordings by the{" "}
        <Text code>file_name</Text> column, so it must match the stored filename
        exactly.
      </Paragraph>

      <div style={{ marginBottom: 20 }}>
        <Text strong>1. Download the template</Text>
        <div style={{ marginTop: 8 }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => downloadRecordingMetadataTemplate()}
          >
            Download CSV template
          </Button>
        </div>
      </div>

      <div>
        <Text strong>2. Upload the filled CSV</Text>
        <div style={{ marginTop: 8 }}>
          <Dragger
            accept=".csv,text/csv"
            multiple={false}
            maxCount={1}
            fileList={uploadFileList}
            beforeUpload={(f) => {
              const isCsv =
                f.type === "text/csv" || f.name.toLowerCase().endsWith(".csv");
              if (!isCsv) {
                message.error("Please select a .csv file");
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
            <p className="ant-upload-text">Click or drag your filled CSV here</p>
            <p className="ant-upload-hint">
              Keep the header row from the template unchanged.
            </p>
          </Dragger>
        </div>
      </div>

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
    const hasUnmatched = preview.unmatched > 0;
    const noMatches = preview.matched === 0;
    const affectedNote =
      preview.affected_recordings === preview.matched
        ? "recordings updated"
        : `${preview.affected_recordings.toLocaleString()} recordings`;

    return (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Review what will change before importing. Nothing has been saved yet.
        </Paragraph>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Rows in file" value={preview.total_rows} />
          <StatCard
            label="Will import"
            value={preview.matched}
            tone={noMatches ? "amber" : "green"}
            sub={noMatches ? "no matches" : affectedNote}
          />
          <StatCard
            label="Skipped"
            value={preview.unmatched}
            tone={hasUnmatched ? "amber" : "neutral"}
            sub={hasUnmatched ? "no matching recording" : "—"}
          />
        </div>

        {/* Columns detected */}
        {preview.columns_present && preview.columns_present.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              Columns detected
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preview.columns_present.map((c) => (
                <Tag key={c} color="blue" style={{ margin: 0 }}>
                  {c}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* Skipped filenames — kept compact in a scroll box */}
        {hasUnmatched && preview.unmatched_file_names.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50">
            <div className="border-b border-amber-200 px-3 py-2 text-sm font-medium text-amber-800">
              {preview.unmatched.toLocaleString()} row(s) skipped — no matching
              recording
            </div>
            <div className="max-h-28 overflow-y-auto px-3 py-2">
              <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-xs text-gray-600">
                {preview.unmatched_file_names.slice(0, 50).map((name, i) => (
                  <li key={i} className="truncate" title={name}>
                    {name}
                  </li>
                ))}
              </ul>
              {preview.unmatched_file_names.length > 50 && (
                <div className="mt-1 text-xs text-gray-400">
                  …and more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Row-level issues */}
        {preview.errors && preview.errors.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50">
            <div className="border-b border-amber-200 px-3 py-2 text-sm font-medium text-amber-800">
              Some rows have issues
            </div>
            <div className="max-h-28 overflow-y-auto px-3 py-2">
              <ul className="m-0 list-disc space-y-0.5 pl-4 text-xs text-gray-600">
                {preview.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Locations */}
        <div className="mt-5">
          <div className="mb-1 flex items-center gap-2">
            <EnvironmentOutlined className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-800">
              Locations found
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {preview.unique_locations.length}
            </span>
          </div>
          <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 13 }}>
            Rename a location to store a different value, or leave the field
            blank to keep it as-is.
          </Paragraph>

          {preview.unique_locations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">
              No location column in this file.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
              {preview.unique_locations.map((loc, idx) => {
                const renamed = (locationRenames[loc.name] ?? "").trim();
                const willRename = renamed !== "" && renamed !== loc.name;
                return (
                  <div
                    key={loc.name}
                    className={`px-3 py-3 ${
                      idx > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    {/* Original value + count */}
                    <div className="flex items-start justify-between gap-2">
                      <Tooltip title={loc.name}>
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                          {loc.name}
                        </div>
                      </Tooltip>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {loc.count.toLocaleString()} rec
                        {loc.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    {/* Rename field, full width */}
                    <Input
                      className="mt-2"
                      size="small"
                      allowClear
                      prefix={
                        <span className="text-xs text-gray-400">
                          Rename to
                        </span>
                      }
                      placeholder="leave blank to keep as-is"
                      value={locationRenames[loc.name] ?? ""}
                      onChange={(e) =>
                        setLocationRenames((prev) => ({
                          ...prev,
                          [loc.name]: e.target.value,
                        }))
                      }
                    />
                    {willRename && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                        <ArrowRightOutlined />
                        <span className="truncate">
                          Will be saved as “{renamed}”
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* No-match hint */}
        {noMatches && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            No rows matched any recording — check that the{" "}
            <Text code>file_name</Text> values match the stored filenames, then
            upload a corrected CSV.
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          {noMatches ? (
            <Button
              type="primary"
              icon={<InboxOutlined />}
              onClick={chooseDifferentFile}
              disabled={busy}
            >
              Upload a different CSV
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
                Confirm import ({preview.affected_recordings.toLocaleString()})
              </Button>
            </>
          )}
        </div>
      </>
    );
  };

  const renderDone = () => {
    if (!result) return null;
    return (
      <>
        {/* Always a success — the import ran; skipped rows are expected and
            reported below as a neutral stat, not a warning. */}
        <Alert
          type="success"
          showIcon
          message="Import complete"
          description="Your metadata has been saved to the matching recordings."
        />

        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatCard label="Rows read" value={result.total_rows ?? 0} />
          <StatCard
            label="Recordings updated"
            value={result.matched ?? 0}
            tone="green"
          />
          <StatCard label="Skipped" value={result.unmatched ?? 0} />
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
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
      title="Recording metadata"
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
