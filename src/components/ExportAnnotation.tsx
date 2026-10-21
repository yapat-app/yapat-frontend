import React from "react";
import { useAppDispatch } from "../hooks";
import { Space, Button, Dropdown } from "antd";
import type { ExportAnnotation } from "../types";
import { exportAllAnnotations } from "../redux/features/datasetSlice";
import type { MenuProps } from "antd";
import { DownOutlined, DownloadOutlined } from "@ant-design/icons";

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

type ExportAnnotationPanelProps = {
  datasetId: string | number;
  /** Same rule as the button: no stats yet, or nothing annotated. */
  disabled: boolean;
  /** Annotated snippet count, or null while stats are still loading. */
  annotated: number | null;
};

/**
 * Expandable Export tile. Same action as ExportAnnotationButton: the same
 * exportAllAnnotations dispatch, the same CSV / JSON formats, the same
 * disabled rule.
 */
export const ExportAnnotationPanel: React.FC<ExportAnnotationPanelProps> = ({
  datasetId,
  disabled,
  annotated,
}) => {
  const dispatch = useAppDispatch();
  const [open, setOpen] = React.useState(false);

  const download = (format: string) => {
    const payload: ExportAnnotation = { dataset_id: datasetId, format };
    dispatch(exportAllAnnotations(payload));
  };

  const toggle = () => {
    if (!disabled) setOpen((o) => !o);
  };

  const subtitle =
    annotated == null
      ? "Loading annotation counts…"
      : annotated < 1
        ? "No annotated snippets to export yet"
        : `Download ${annotated.toLocaleString()} labelled snippet${annotated === 1 ? "" : "s"} for analysis or training`;

  return (
    <div
      className={`rounded-lg border bg-white transition-colors ${
        disabled ? "border-slate-200" : "border-blue-500"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-disabled={disabled}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={`flex items-center gap-3 px-4 py-3.5 ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        } focus-visible:outline-2 focus-visible:outline-blue-500`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            disabled ? "bg-slate-100 text-slate-500" : "bg-blue-600 text-white"
          }`}>
          <DownloadOutlined />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-slate-900 font-ibm-sans">
            Export annotations
          </p>
          <p className="m-0 text-xs text-slate-500 font-ibm-sans">{subtitle}</p>
        </div>
        <DownOutlined
          className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && !disabled && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          <Button onClick={() => download("csv")}>Export as CSV</Button>
          <Button onClick={() => download("json")}>Export as JSON</Button>
        </div>
      )}
    </div>
  );
};
