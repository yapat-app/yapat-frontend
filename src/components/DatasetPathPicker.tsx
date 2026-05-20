import { Breadcrumb, Button, Spin } from "antd";
import {
  FolderOpenOutlined,
  FolderOutlined,
  RightOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAvailableDatasetPaths } from "../redux/features/datasetSlice";

type DatasetPathPickerProps = {
  value?: string;
  onChange?: (path: string) => void;
};

export const DatasetPathPicker: React.FC<DatasetPathPickerProps> = ({
  value,
  onChange,
}) => {
  const dispatch = useAppDispatch();
  const { availablePaths, availablePathsLoading } = useAppSelector(
    (state) => state.dataset,
  );

  const [browsePrefix, setBrowsePrefix] = useState<string>("");

  const load = useCallback(
    (prefix: string) => {
      dispatch(fetchAvailableDatasetPaths(prefix || undefined));
    },
    [dispatch],
  );

  useEffect(() => {
    load(browsePrefix);
  }, [browsePrefix, load]);

  const breadcrumbItems = useMemo(() => {
    const items: { title: React.ReactNode; path: string }[] = [
      {
        title: "Data volume",
        path: "",
      },
    ];
    if (availablePaths?.current_path) {
      const segments = availablePaths.current_path.split("/");
      let acc = "";
      for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg;
        items.push({ title: seg, path: acc });
      }
    }
    return items;
  }, [availablePaths?.current_path]);

  const handleSelectCurrent = () => {
    const path = availablePaths?.current_path ?? "";
    if (!path) return;
    onChange?.(path);
  };

  const handleSelectEntry = (path: string) => {
    onChange?.(path);
  };

  const handleOpenEntry = (path: string) => {
    setBrowsePrefix(path);
  };

  const handleBreadcrumb = (path: string) => {
    setBrowsePrefix(path);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <Breadcrumb
          className="text-xs"
          items={breadcrumbItems.map((item, idx) => ({
            title:
              idx < breadcrumbItems.length - 1 ? (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-blue-600 hover:underline"
                  onClick={() => handleBreadcrumb(item.path)}
                >
                  {item.title}
                </button>
              ) : (
                <span className="text-gray-700">{item.title}</span>
              ),
          }))}
        />
        {availablePaths?.current_path ? (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleSelectCurrent}
            className={
              value === availablePaths.current_path
                ? "font-semibold text-emerald-700"
                : ""
            }
          >
            Use this folder
          </Button>
        ) : null}
      </div>

      {value ? (
        <div className="border-b border-gray-100 px-3 py-1.5 text-xs text-gray-600">
          Selected:{" "}
          <span className="font-mono font-medium text-gray-900">{value}</span>
        </div>
      ) : null}

      <div className="max-h-48 overflow-y-auto p-1">
        {availablePathsLoading ? (
          <div className="flex justify-center py-8">
            <Spin size="small" />
          </div>
        ) : (availablePaths?.paths ?? []).length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-500">
            {availablePaths?.current_path
              ? "No subfolders here. Use “Use this folder” for the current path."
              : "No folders found on the data volume."}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {(availablePaths?.paths ?? []).map((entry) => {
              const isSelected = value === entry.path;
              return (
                <li
                  key={entry.path}
                  className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-white ${
                    isSelected ? "bg-emerald-50" : ""
                  }`}
                >
                  <FolderOutlined className="shrink-0 text-amber-600" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-gray-800 hover:text-blue-700"
                    title={entry.path}
                    onClick={() =>
                      entry.has_children
                        ? handleOpenEntry(entry.path)
                        : handleSelectEntry(entry.path)
                    }
                  >
                    {entry.name}
                  </button>
                  {entry.has_children ? (
                    <button
                      type="button"
                      className="flex shrink-0 items-center gap-0.5 border-0 bg-transparent px-1 py-0.5 text-xs text-blue-600 hover:underline"
                      onClick={() => handleOpenEntry(entry.path)}
                      title={`Open ${entry.name}`}
                    >
                      Open
                      <RightOutlined className="text-[10px]" />
                    </button>
                  ) : null}
                  <Button
                    type="text"
                    size="small"
                    icon={<FolderOpenOutlined />}
                    className={
                      isSelected ? "text-emerald-700" : "text-gray-500"
                    }
                    onClick={() => handleSelectEntry(entry.path)}
                    title={`Select ${entry.path}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {availablePaths?.data_root ? (
        <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400">
          Mount: {availablePaths.data_root}
        </p>
      ) : null}
    </div>
  );
};
