import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Table, Tag, Tooltip, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { QuickLabel } from "../types";
import { alApi } from "../services/alApi";
import { useAppSelector } from "../hooks";
import { fetchPamQuickLabelNames } from "../utils/fetchPamQuickLabelNames";
import {
  QuickLabelImportError,
  buildImportPreview,
  checkFileSize,
  formatFromFileName,
  localLabel,
  parseQuickLabelText,
  type ImportPreviewRow,
} from "../utils/quickLabelImport";

type Props = {
  datasetId: number;
  /** Current draft list of the dialog; import only appends to it. */
  labels: QuickLabel[];
  onAdd: (labels: QuickLabel[]) => void;
};

const STATUS_TAG: Record<ImportPreviewRow["status"], React.ReactNode> = {
  new: <Tag color="green">New</Tag>,
  existing: <Tag>Already in list</Tag>,
  duplicate: <Tag>Duplicate in file</Tag>,
};

export const QuickLabelImportPanel: React.FC<Props> = ({ datasetId, labels, onAdd }) => {
  const { usedCheckpointId, selectedDatasetId } = useAppSelector((s) => s.al);
  const [incoming, setIncoming] = useState<QuickLabel[] | null>(null);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  // undefined while loading, null when the dataset has no trained model.
  const [modelCkptId, setModelCkptId] = useState<number | null | undefined>(undefined);
  const [modelLoading, setModelLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setModelCkptId(undefined);
    alApi
      .getCheckpoints(datasetId)
      .then((ckpts) => {
        if (cancelled) return;
        if (ckpts.length === 0) return setModelCkptId(null);
        // Prefer the checkpoint the hub uses for this dataset, else the newest.
        if (Number(selectedDatasetId) === datasetId && usedCheckpointId != null) {
          return setModelCkptId(usedCheckpointId);
        }
        const newest = [...ckpts].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0];
        setModelCkptId(newest.id);
      })
      .catch(() => !cancelled && setModelCkptId(null));
    return () => {
      cancelled = true;
    };
  }, [datasetId, selectedDatasetId, usedCheckpointId]);

  const rows = useMemo(
    () => (incoming ? buildImportPreview(incoming, labels) : []),
    [incoming, labels],
  );

  const showPreview = (list: QuickLabel[]) => {
    setError(null);
    setIncoming(list);
    setSelected(
      buildImportPreview(list, labels)
        .filter((r) => r.status === "new")
        .map((r) => r.key),
    );
  };

  const parseOrReport = (run: () => QuickLabel[]) => {
    try {
      showPreview(run());
    } catch (e) {
      setIncoming(null);
      setError(
        e instanceof QuickLabelImportError
          ? e.message
          : `Couldn't read this file: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const readFile = async (file: File) => {
    const format = formatFromFileName(file.name);
    if (!format) {
      setIncoming(null);
      setError("Couldn't read this file: use a .json, .csv or .txt file");
      return;
    }
    try {
      checkFileSize(file.size);
    } catch (e) {
      setIncoming(null);
      setError((e as Error).message);
      return;
    }
    const text = await file.text();
    parseOrReport(() => parseQuickLabelText(text, format));
  };

  const loadModelSpecies = async () => {
    if (modelCkptId == null) return;
    setModelLoading(true);
    try {
      const names = await fetchPamQuickLabelNames(modelCkptId, datasetId);
      parseOrReport(() => names.filter((n) => n.trim()).map(localLabel));
    } finally {
      setModelLoading(false);
    }
  };

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    existing: rows.filter((r) => r.status === "existing").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
  };
  const chosen = rows.filter((r) => r.status === "new" && selected.includes(r.key));

  const add = () => {
    onAdd(chosen.map((r) => r.label));
    setIncoming(null);
    setSelected([]);
    setPasteText("");
  };

  // The whole panel takes file drops, not only the Dragger box: a file dropped
  // on the paste box or the preview would otherwise be opened by the browser.
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const dropZone = {
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      setDragging(false);
      // The Dragger already handled drops onto it.
      if (e.defaultPrevented) return;
      const file = e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      void readFile(file);
    },
    style: {
      display: "flex",
      flexDirection: "column" as const,
      gap: 8,
      borderRadius: 6,
      outline: dragging ? "2px dashed #1890ff" : undefined,
      outlineOffset: 4,
    },
  };

  if (incoming) {
    return (
      <div {...dropZone}>
        <div style={{ fontSize: "var(--text-fs-12)", color: "#555" }}>
          {counts.new} new, {counts.existing} already present, {counts.duplicate} duplicates
        </div>
        <Table<ImportPreviewRow>
          size="small"
          rowKey="key"
          dataSource={rows}
          pagination={false}
          scroll={{ y: 240 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (r) => ({ disabled: r.status !== "new" }),
          }}
          onRow={(r) => ({ style: r.similarTo ? { background: "#fffbe6" } : undefined })}
          columns={[
            { title: "Name", dataIndex: ["label", "display_name"], ellipsis: true },
            { title: "Source", dataIndex: "source", width: 72 },
            {
              title: "Status",
              width: 150,
              render: (_, r) => (
                <>
                  {STATUS_TAG[r.status]}
                  {r.similarTo && (
                    <Tooltip title="The model treats names that differ only by case or underscore vs space as different labels">
                      <Tag color="orange">Similar to {r.similarTo}</Tag>
                    </Tooltip>
                  )}
                </>
              ),
            },
          ]}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button size="small" onClick={() => setIncoming(null)}>
            Cancel
          </Button>
          <Button size="small" type="primary" disabled={chosen.length === 0} onClick={add}>
            Add {chosen.length} {chosen.length === 1 ? "label" : "labels"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div {...dropZone}>
      <Upload.Dragger
        accept=".json,.csv,.txt"
        multiple={false}
        showUploadList={false}
        // Read in the browser only; nothing is uploaded.
        beforeUpload={(file) => {
          void readFile(file);
          return Upload.LIST_IGNORE;
        }}
      >
        <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
          <InboxOutlined />
        </p>
        <p style={{ fontSize: "var(--text-fs-12)", margin: 0 }}>Click or drop a file here</p>
        <p style={{ fontSize: "var(--text-fs-11)", color: "#888", margin: 0 }}>
          JSON list of labels, or one name per line (.txt/.csv)
        </p>
      </Upload.Dragger>

      {error && <Alert type="error" showIcon message={error} />}

      <Tooltip title={modelCkptId === null ? "This dataset has no trained model yet" : undefined}>
        <Button
          size="small"
          disabled={modelCkptId == null}
          loading={modelLoading}
          onClick={loadModelSpecies}
        >
          Add the model's species
        </Button>
      </Tooltip>

      {showPaste ? (
        <>
          <Input.TextArea
            rows={5}
            placeholder={"One name per line or comma-separated\ne.g. Adenomera andreae, No biophony"}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <Button
            size="small"
            type="primary"
            disabled={!pasteText.trim()}
            onClick={() => parseOrReport(() => parseQuickLabelText(pasteText, "paste"))}
          >
            Preview
          </Button>
        </>
      ) : (
        <Button size="small" type="link" style={{ alignSelf: "flex-start", padding: 0 }} onClick={() => setShowPaste(true)}>
          Paste names instead
        </Button>
      )}
    </div>
  );
};
