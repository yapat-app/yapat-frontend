import React, { useState } from "react";
import { useAppDispatch } from "../hooks";
import { Space, Button, Dropdown, Modal, Select, Radio, Typography } from "antd";
import type { ExportAnnotation } from "../types";
import { exportAllAnnotations } from "../redux/features/datasetSlice";
import type { MenuProps } from "antd";
import { DownOutlined } from "@ant-design/icons";

type ExportAnnotationButtonProps = {
  datasetId: string | number;
  disabled: boolean;
};

export const ExportAnnotationButton: React.FC<ExportAnnotationButtonProps> = ({
  datasetId,
  disabled,
}) => {
  const dispatch = useAppDispatch();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeLabels, setScopeLabels] = useState<string[]>([]);
  const [scopeFormat, setScopeFormat] = useState("csv");

  const handleCSVDownload = (format: string) => {
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format: format,
    };
    dispatch(exportAllAnnotations(payload));
  };

  const handleScopedDownload = () => {
    if (!scopeLabels.length) return;
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format: scopeFormat,
      labels: scopeLabels,
    };
    dispatch(exportAllAnnotations(payload));
    setScopeOpen(false);
  };

  const items: MenuProps["items"] = [
    {
      label: (
        <Button onClick={() => handleCSVDownload("csv")}>Export as CSV</Button>
      ),
      key: "0",
    },
    {
      label: (
        <Button onClick={() => handleCSVDownload("json")}>
          Export as JSON
        </Button>
      ),
      key: "1",
    },
    {
      type: "divider",
    },
    {
      label: (
        <Button onClick={() => setScopeOpen(true)}>Export label scope…</Button>
      ),
      key: "2",
    },
  ];
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
        title="Export label scope"
        open={scopeOpen}
        onCancel={() => setScopeOpen(false)}
        onOk={handleScopedDownload}
        okText="Export"
        okButtonProps={{ disabled: !scopeLabels.length }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text>Labels</Typography.Text>
            <Select
              mode="tags"
              value={scopeLabels}
              onChange={setScopeLabels}
              style={{ width: "100%" }}
              placeholder="e.g. Boana cipoensis, rain"
              tokenSeparators={[","]}
              autoFocus
            />
          </div>
          <Typography.Text type="secondary">
            Snippets carrying any of these labels are exported with all of their
            annotations, so co-occurring labels (wind, rain, stream…) stay
            visible. The <code>in_scope</code> column marks the rows that
            matched.
          </Typography.Text>
          <Radio.Group
            value={scopeFormat}
            onChange={(e) => setScopeFormat(e.target.value)}
          >
            <Radio.Button value="csv">CSV</Radio.Button>
            <Radio.Button value="json">JSON</Radio.Button>
          </Radio.Group>
        </Space>
      </Modal>
    </>
  );
};
