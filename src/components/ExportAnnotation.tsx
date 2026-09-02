import React, { useRef, useState } from "react";
import { useAppDispatch } from "../hooks";
import {
  Space,
  Button,
  Checkbox,
  Dropdown,
  Modal,
  Select,
  Radio,
  Spin,
  Typography,
} from "antd";
import type { ExportAnnotation } from "../types";
import { exportAllAnnotations } from "../redux/features/datasetSlice";
import { datasetApi } from "../services/api";
import type { MenuProps } from "antd";
import { DownOutlined } from "@ant-design/icons";

type ExportAnnotationButtonProps = {
  datasetId: string | number;
  disabled: boolean;
};

type ExportScope = "all" | "labels";

export const ExportAnnotationButton: React.FC<ExportAnnotationButtonProps> = ({
  datasetId,
  disabled,
}) => {
  const dispatch = useAppDispatch();
  // Picking a format opens this dialog; the scope question is asked there
  // rather than as a separate menu entry, so every export goes through the
  // same choice.
  const [format, setFormat] = useState<string | null>(null);
  const [scope, setScope] = useState<ExportScope>("all");
  const [scopeLabels, setScopeLabels] = useState<string[]>([]);
  // Off by default: "only selected labels" should mean only those labels. The
  // snippet-level view is worth having when a co-occurring label is context for
  // the match (a species heard during rain), not when it is just another
  // species nobody asked about.
  const [includeCoOccurring, setIncludeCoOccurring] = useState(false);
  // Labels actually present on this dataset's annotations. Fetched each time
  // the dialog opens, so a label added since the page loaded is offered
  // without a reload.
  const [available, setAvailable] = useState<string[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  // Reopening before the previous fetch lands would otherwise let the stale
  // response overwrite the newer one.
  const requestRef = useRef(0);

  const loadLabels = (id: string | number) => {
    const token = ++requestRef.current;
    setLoadingLabels(true);
    datasetApi
      .getAnnotationLabels(Number(id))
      .then(({ labels }) => {
        if (token === requestRef.current) setAvailable(labels);
      })
      // The picker stays usable without suggestions: it is a tags input, so a
      // label typed by hand scopes the export just as well.
      .catch(() => {
        if (token === requestRef.current) setAvailable([]);
      })
      .finally(() => {
        if (token === requestRef.current) setLoadingLabels(false);
      });
  };

  const openFor = (nextFormat: string) => {
    setFormat(nextFormat);
    setScope("all");
    setScopeLabels([]);
    setIncludeCoOccurring(false);
    setAvailable([]);
    loadLabels(datasetId);
  };

  const close = () => setFormat(null);

  const handleExport = () => {
    if (!format) return;
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format,
      ...(scope === "labels"
        ? { labels: scopeLabels, include_co_occurring: includeCoOccurring }
        : {}),
    };
    dispatch(exportAllAnnotations(payload));
    close();
  };

  const items: MenuProps["items"] = [
    {
      label: <Button onClick={() => openFor("csv")}>Export as CSV</Button>,
      key: "0",
    },
    {
      label: <Button onClick={() => openFor("json")}>Export as JSON</Button>,
      key: "1",
    },
    {
      type: "divider",
    },
  ];

  const exportBlocked = scope === "labels" && scopeLabels.length === 0;

  return (
    <>
      <Dropdown menu={{ items }} disabled={disabled}>
        <a onClick={(e) => e.preventDefault()}>
          <Space>
            <Button disabled={disabled}>
              Export
              <DownOutlined />
            </Button>
          </Space>
        </a>
      </Dropdown>

      <Modal
        title={`Export annotations as ${format?.toUpperCase() ?? ""}`}
        open={format !== null}
        onCancel={close}
        onOk={handleExport}
        okText="Export"
        okButtonProps={{ disabled: exportBlocked }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Radio.Group
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <Space direction="vertical">
              <Radio value="all">All annotations</Radio>
              <Radio value="labels">Only selected labels</Radio>
            </Space>
          </Radio.Group>

          {scope === "labels" && (
            <>
              <Select
                mode="tags"
                value={scopeLabels}
                onChange={setScopeLabels}
                style={{ width: "100%" }}
                placeholder="e.g. Boana cipoensis, rain"
                tokenSeparators={[","]}
                autoFocus
                loading={loadingLabels}
                options={available.map((label) => ({
                  value: label,
                  label,
                }))}
                filterOption={(input, option) =>
                  (option?.value ?? "")
                    .toString()
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                notFoundContent={
                  loadingLabels ? (
                    <Spin size="small" />
                  ) : (
                    "No labels on this dataset yet — type one to scope by it"
                  )
                }
              />
              <Checkbox
                checked={includeCoOccurring}
                onChange={(e) => setIncludeCoOccurring(e.target.checked)}
              >
                Include co-occurring labels on the same snippet
              </Checkbox>
              <Typography.Text type="secondary">
                {includeCoOccurring ? (
                  <>
                    Snippets carrying any of these labels are exported with all
                    of their annotations, so co-occurring labels (wind, rain,
                    stream…) stay visible in the <code>label</code> column.
                  </>
                ) : (
                  <>
                    Only annotations carrying these labels are exported.
                    Suggestions are the labels already on this dataset; anything
                    else can still be typed in.
                  </>
                )}
              </Typography.Text>
            </>
          )}
        </Space>
      </Modal>
    </>
  );
};
