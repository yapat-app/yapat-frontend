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

  const openFor = (nextFormat: string) => {
    setFormat(nextFormat);
    setScope("all");
    setScopeLabels([]);
  };

  const close = () => setFormat(null);

  const handleExport = () => {
    if (!format) return;
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format,
      ...(scope === "labels" ? { labels: scopeLabels } : {}),
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
              />
              <Typography.Text type="secondary">
                Snippets carrying any of these labels are exported with all of
                their annotations, so co-occurring labels (wind, rain, stream…)
                stay visible. The <code>in_scope</code> column marks the rows
                that matched.
              </Typography.Text>
            </>
          )}
        </Space>
      </Modal>
    </>
  );
};
