import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input, Spin, Tooltip, Empty, Button, Pagination } from "antd";
import {
  AudioOutlined,
  FolderOpenOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { NavigationBar } from "../components/NavigationBar";
import { recordingApi } from "../services/api";
import { useAppSelector } from "../hooks";
import type { Recording } from "../types";

// Fetch recordings in pages to cover large datasets without a single huge call.
const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // safety cap (~200k files)

// Default number of files shown per page (user-adjustable in the view).
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

export const DatasetFiles = () => {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const id = Number(datasetId);

  const { allDatasets } = useAppSelector((state) => state.dataset);
  const datasetName = useMemo(() => {
    const match = (allDatasets ?? []).find((d) => Number(d.id) === id);
    return match?.name ?? null;
  }, [allDatasets, id]);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      setError("Invalid dataset");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const all: Recording[] = [];
        for (let page = 0; page < MAX_PAGES; page++) {
          const batch = await recordingApi.getAll({
            dataset_id: id,
            skip: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          });
          if (cancelled) return;
          all.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
        if (!cancelled) setRecordings(all);
      } catch (err: any) {
        if (!cancelled)
          setError(err?.message || "Failed to load audio files");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const fileNameOf = (r: Recording) =>
    r.file_name || r.name || r.file_path?.split("/").pop() || `#${r.id}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter(
      (r) =>
        fileNameOf(r).toLowerCase().includes(q) ||
        (r.file_path ?? "").toLowerCase().includes(q),
    );
  }, [recordings, search]);

  // Reset to the first page whenever the filter result changes.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Escape a value for CSV (RFC 4180): wrap in quotes and double any inner quote.
  const csvCell = (value: string) => `"${(value ?? "").replace(/"/g, '""')}"`;

  const handleExportCsv = () => {
    // Export the currently visible list, so an active search filters the output.
    const rows = filtered;
    const header = ["filename", "file_path"];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [csvCell(fileNameOf(r)), csvCell(r.file_path ?? "")].join(","),
      ),
    ];
    // Prepend BOM so Excel opens UTF-8 filenames correctly.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (datasetName ?? `dataset-${id}`).replace(/[^\w.-]+/g, "_");
    a.download = `${safeName}-files.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <NavigationBar />
      <div className="w-full h-full flex justify-center">
        <div className="w-[85%]">
          <div className="my-6">
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              className="pl-0!"
              onClick={() => navigate(-1)}
            >
              Back to Datasets
            </Button>
            <div className="mt-2 flex items-center gap-2">
              <FolderOpenOutlined className="text-blue-500 text-xl" />
              <h1 className="text-2xl font-bold font-ibm-mono">
                {datasetName ?? `Dataset #${id}`}
              </h1>
            </div>
            <p className="sub_description_text">
              Audio files in this dataset
              {!loading && ` — ${recordings.length} file(s)`}
            </p>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <Input
              allowClear
              size="large"
              className="max-w-md"
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Search files by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              size="large"
              icon={<DownloadOutlined />}
              onClick={handleExportCsv}
              disabled={loading || filtered.length === 0}
            >
              Export CSV
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center gap-3 p-12 text-gray-500">
                <Spin />
                <span>Loading audio files…</span>
              </div>
            ) : error ? (
              <div className="p-12 text-center text-red-500">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="p-12">
                <Empty
                  description={
                    search
                      ? `No files match "${search}"`
                      : "No audio files found"
                  }
                />
              </div>
            ) : (
              <>
                {search && (
                  <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
                    {filtered.length} match(es)
                  </div>
                )}
                <div className="max-h-[calc(100vh-400px)] overflow-y-auto divide-y divide-gray-50">
                  {pageItems.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-default"
                    >
                      <AudioOutlined className="text-green-600" />
                      <Tooltip
                        title={r.file_path}
                        placement="right"
                        autoAdjustOverflow={false}
                        overlayStyle={{ maxWidth: "none" }}
                        overlayInnerStyle={{ whiteSpace: "nowrap" }}
                      >
                        <span className="truncate text-sm text-gray-700 font-ibm-mono">
                          {fileNameOf(r)}
                        </span>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end border-t border-gray-100 px-4 py-3">
                  <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={filtered.length}
                    showSizeChanger
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    showTotal={(total) => `${total} file(s)`}
                    onChange={(p, size) => {
                      if (size !== pageSize) {
                        setPageSize(size);
                        setPage(1);
                      } else {
                        setPage(p);
                      }
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
