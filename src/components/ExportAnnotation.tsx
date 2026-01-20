import React from "react";
import { useAppDispatch } from "../hooks";
import { Space, Button, Dropdown } from "antd";
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
  const handleCSVDownload = (format: string) => {
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format: format,
    };
    dispatch(exportAllAnnotations(payload));
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
  ];
  return (
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
  );
};
