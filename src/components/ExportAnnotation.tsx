import React, { useEffect, useState, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Card, Tag, Space, Button, Dropdown } from "antd";
import type { ExportAnnotation } from "../types";
import { exportAllAnnotations } from "../redux/features/datasetSlice";
import type { MenuProps } from "antd";
import { DownOutlined } from "@ant-design/icons";

type ExportAnnotationButtonProps = {
  datasetId: string;
};

export const ExportAnnotationButton: React.FC<ExportAnnotationButtonProps> = ({
  datasetId,
}) => {
  const dispatch = useAppDispatch();
  const handleCSVDownload = (format: string) => {
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format: format,
    };
    console.log(payload);
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
    <Dropdown menu={{ items }}>
      <a onClick={(e) => e.preventDefault()}>
        <Space>
          <Button>
            Export
            <DownOutlined />
          </Button>
        </Space>
      </a>
    </Dropdown>
  );
};
