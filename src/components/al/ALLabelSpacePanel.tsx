/**
 * ALLabelSpacePanel
 *
 * Renders the Label Space on the Active Learning page in the same as the Annotation Page
 */

import React, { useState, useMemo } from "react";
import { List, Tag, Tooltip, Spin, Empty } from "antd";
import {
  TagsOutlined,
  DownOutlined,
  RightOutlined,
  SearchOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "../../hooks";
import { submitFeedback } from "../../redux/features/alSlice";
import type { LabelSpaceItem } from "../../types";

export const ALLabelSpacePanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");

  const { labelSpace, loading } = useAppSelector((s) => s.customTaxonomy);
  const { selectedSnippetId, feedbacks, selectedDatasetId, modelFamilyName } = useAppSelector((s) => s.al);

  const alreadyFeedback = selectedSnippetId !== null
    ? !!feedbacks[selectedSnippetId]
    : false;
  const canAnnotate =
    selectedSnippetId !== null &&
    selectedDatasetId !== null &&
    modelFamilyName !== null &&
    !alreadyFeedback;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return labelSpace as LabelSpaceItem[];
    return (labelSpace as LabelSpaceItem[]).filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.scientific_name?.toLowerCase().includes(q),
    );
  }, [labelSpace, search]);

  // Unique ontology ranks for the footer
  const uniqueRanks = useMemo(() => {
    return Array.from(
      new Set(
        (labelSpace as LabelSpaceItem[])
          .map((l) => l.metadata?.rank)
          .filter(Boolean),
      ),
    ).sort() as string[];
  }, [labelSpace]);

  const handleAnnotate = (label: LabelSpaceItem) => {
    if (!canAnnotate) return;
    dispatch(
      submitFeedback({
        dataset_id: selectedDatasetId!,
        model_family_name: modelFamilyName!,
        snippet_id: selectedSnippetId!,
        action: "MODIFY",
        labels: [label.name],
      }),
    );
  };

  // ── Header (always visible) ───────────────────────────────────────────────
  const header = (
    <button
      onClick={() => setOpen((o) => !o)}
      className="w-full flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <TagsOutlined className="text-indigo-500 text-xs" />
        <span className="text-xs font-semibold text-gray-700 font-ibm-sans tracking-wide uppercase">
          Label Space
        </span>
        {labelSpace.length > 0 && (
          <Tag
            color="purple"
            style={{ fontSize: 10, padding: "0 5px", lineHeight: "16px", marginLeft: 2 }}
          >
            {labelSpace.length}
          </Tag>
        )}
        {selectedSnippetId === null && (
          <span className="text-[10px] text-gray-400 font-ibm-sans italic ml-1">
            select a point to annotate
          </span>
        )}
        {alreadyFeedback && (
          <span className="text-[10px] text-gray-400 font-ibm-sans italic ml-1">
            already reviewed
          </span>
        )}
      </div>
      {open ? (
        <DownOutlined className="text-gray-400 text-[10px]" />
      ) : (
        <RightOutlined className="text-gray-400 text-[10px]" />
      )}
    </button>
  );

  if (!open) return <div className="flex-shrink-0">{header}</div>;

  // ── Expanded body ─────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 flex flex-col border-b border-gray-200 bg-white" style={{ maxHeight: "42vh" }}>
      {header}

      {/* Search */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
        <div className="relative">
          <SearchOutlined className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-xs pointer-events-none" />
          <input
            placeholder="Search labels"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {/* Label list — same row layout as Annotation page */}
      <div className="overflow-y-auto flex-1 px-3">
        {loading && labelSpace.length === 0 ? (
          <div className="flex justify-center py-4">
            <Spin size="small" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              labelSpace.length === 0 ? (
                <span className="text-xs text-gray-400">
                  No label space yet —{" "}
                  <Link to="/taxonomies" className="text-indigo-500 hover:underline">
                    build one on the Taxonomies page
                  </Link>
                </span>
              ) : (
                <span className="text-xs text-gray-400">No matches</span>
              )
            }
            style={{ margin: "8px 0" }}
          />
        ) : (
          <List
            dataSource={filtered}
            size="small"
            split={false}
            renderItem={(label) => (
              <List.Item
                key={label.id}
                className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 rounded !px-0 !py-1"
              >
                <div className="py-1 flex items-center justify-between w-full">
                  {/* Left: name + rank badge + kingdom + scientific name */}
                  <div className="min-w-0 flex-1">
                    <span className="font-ibm-sans text-sm text-gray-900">
                      {label.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {label.metadata?.rank && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {label.metadata.rank}
                        </span>
                      )}
                      {label.metadata?.kingdom && (
                        <span className="text-xs text-gray-600">
                          {label.metadata.kingdom}
                        </span>
                      )}
                      {label.scientific_name && label.scientific_name !== label.name && (
                        <span className="text-xs text-blue-600 italic">
                          {label.scientific_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Annotate button */}
                  <Tooltip
                    title={
                      canAnnotate
                        ? `Apply "${label.name}" as corrected label`
                        : selectedSnippetId === null
                        ? "Select a prediction point first"
                        : "Already reviewed"
                    }
                    mouseEnterDelay={0.5}
                  >
                    <button
                      onClick={() => handleAnnotate(label)}
                      disabled={!canAnnotate}
                      className={[
                        "ml-3 flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all",
                        canAnnotate
                          ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100 cursor-pointer"
                          : "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <CheckOutlined style={{ fontSize: 10 }} />
                      Annotate
                    </button>
                  </Tooltip>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>

      {/* Ontologies footer — matches annotation page */}
      {uniqueRanks.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 font-ibm-sans mr-2">
            Ontologies
          </span>
          <div className="inline-flex flex-wrap gap-1 mt-0.5">
            {uniqueRanks.map((rank) => (
              <Tag key={rank} color="green" variant="outlined" style={{ fontSize: 10, padding: "0 5px", lineHeight: "18px" }}>
                {rank}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
