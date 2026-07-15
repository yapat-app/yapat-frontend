/**
 * LabelSelector — multi-label picker for the "blind" labeling mode.
 *
 * Sources:
 *  1. Dataset-wide quick-label list supplied by the owning page.
 *
 * The component exposes `value` / `onChange` so it plugs directly into AntD
 * Form or can be used standalone.
 */

import React, { useState, useMemo } from "react";
import { Select, Tag, Spin, Tooltip, Empty, Button } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { studyLogger } from "../../studyLogging";

const MAX_VISIBLE_LABELS = 300;

interface Props {
  value?: string[];
  onChange?: (labels: string[]) => void;
  getLabelTooltip?: (label: string) => string | null;
  disabled?: boolean;
  placeholder?: string;
  /** Show an always-visible label list below the selector (Annotation-like UI). */
  showList?: boolean;
  /** If true, selected labels are shown above and hidden inside the input. */
  hideSelectedInInput?: boolean;
  /** If false, do not render the selected-label chips row above the input. */
  showSelectedRow?: boolean;
  /**
   * If true, render without the big outer bordered container for the label list.
   * Use when the selector is already inside a bordered panel so we don't end up
   * with a very tall border box (looks like an overly-long “border line”).
   */
  embedded?: boolean;
  /**
   * If true, the component fills its parent's height: outer is `flex flex-col h-full`
   * and the available-labels list grows/shrinks via `flex-1 min-h-0 overflow-auto`
   * instead of the fixed `max-h-[380px]`. Use when this lives inside a bounded panel.
   */
  fillHeight?: boolean;
  /** Dataset-wide quick labels supplied by the owning page. */
  quickLabels: string[];
  labelsLoading: boolean;
  /**
   * Compact inline mode — no outer border, no section headers, no source badges.
   * Renders a search input + a flat wrapping row of small label chips.
   * Designed for inline embedding inside a snippet card below the spectrogram.
   */
  compact?: boolean;
}

export const LabelSelector: React.FC<Props> = ({
  value = [],
  onChange,
  getLabelTooltip,
  disabled = false,
  placeholder = "Search species…",
  showList = true,
  hideSelectedInInput = true,
  showSelectedRow = true,
  embedded = false,
  fillHeight = false,
  quickLabels,
  labelsLoading,
  compact = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const pamOptions = useMemo(
    () => quickLabels.map((sp) => ({ value: sp, label: sp, source: "pam" as const })),
    [quickLabels],
  );

  const searchQueryLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const filteredPamOptions = useMemo(
    () =>
      searchQuery
        ? pamOptions.filter((o) => o.value.toLowerCase().includes(searchQueryLower))
        : pamOptions,
    [pamOptions, searchQuery, searchQueryLower],
  );

  const combinedList = useMemo(
    () => filteredPamOptions.slice(0, MAX_VISIBLE_LABELS),
    [filteredPamOptions],
  );

  const selectedSet = useMemo(() => new Set((value ?? []).map((v) => v.toLowerCase())), [value]);

  const toggle = (label: string) => {
    if (!onChange) return;
    const normalized = (value ?? []);
    const exists = normalized.some((x) => x.toLowerCase() === label.toLowerCase());
    const next = exists
      ? normalized.filter((x) => x.toLowerCase() !== label.toLowerCase())
      : [...normalized, label];
    studyLogger.log("label_toggle", {
      label,
      op: exists ? "remove" : "add",
      labelsAfter: next,
    });
    onChange(next);
  };

  const clearAll = () => {
    if (!onChange) return;
    studyLogger.log("label_clear", { labelsBefore: value ?? [] });
    onChange([]);
  };

  // ── Compact inline mode ───────────────────────────────────────────────────
  if (compact) {
    return (
      <div data-tour="labeling" className={["flex flex-col gap-2", fillHeight ? "h-full min-h-0" : ""].join(" ")}>

        {/* ── Current labels — shown as dismissible AntD Tags ── */}
        {value.length > 0 && (
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider font-ibm-sans">
                Labels
              </span>
              <button
                type="button"
                onClick={clearAll}
                disabled={disabled}
                className="text-[11px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {value.map((lbl) => (
                <Tooltip key={lbl} title={getLabelTooltip?.(lbl) ?? undefined}>
                  <Tag
                    color="blue"
                    closable={!disabled}
                    onClose={(e) => {
                      e.preventDefault();
                      toggle(lbl);
                    }}
                    className="text-xs font-semibold rounded-md px-2 py-0.5 m-0 cursor-help"
                  >
                    {lbl}
                  </Tag>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {/* ── Quick label chips ── */}
        <div className="shrink-0 flex items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider font-ibm-sans">
            Quick labels
          </span>
          {labelsLoading && <Spin size="small" className="ml-2" />}
        </div>

        <div
          className={[
            fillHeight ? "flex-1 min-h-0 overflow-y-auto" : "max-h-40 overflow-y-auto",
            "pr-0.5",
          ].join(" ")}
        >
          {pamOptions.length === 0 && !labelsLoading ? (
            <p className="text-xs text-gray-400 italic">
              No labels available. Run Active Learning inference once to load labels.json for this dataset.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pamOptions.map((opt) => {
                const isSelected = selectedSet.has(opt.value.toLowerCase());
                return (
                  <button
                    key={`pam:${opt.value}`}
                    type="button"
                    disabled={disabled || labelsLoading}
                    onClick={() => toggle(opt.value)}
                    title={isSelected ? `Remove "${opt.value}"` : `Add "${opt.value}"`}
                    className={[
                      "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-sm font-semibold transition-all duration-150 select-none",
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700",
                      disabled || labelsLoading
                        ? "opacity-40 cursor-not-allowed"
                        : "cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300",
                    ].join(" ")}
                  >
                    <span className="truncate max-w-45">{opt.value}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full mode (default) ───────────────────────────────────────────────────
  return (
    <div className={["flex flex-col gap-2", fillHeight ? "h-full min-h-0" : ""].join(" ")}>
      {/* Selected labels (shown outside the search input) */}
      {showSelectedRow && hideSelectedInInput && value.length > 0 && (
        <div
          className={[
            "flex flex-wrap gap-2 shrink-0",
            fillHeight ? "max-h-18 overflow-auto pr-1" : "",
          ].join(" ")}
        >
          {value.map((lbl) => (
            <Tag
              key={lbl}
              closable={!disabled && !labelsLoading}
              onClose={(e) => {
                e.preventDefault();
                toggle(lbl);
              }}
              className="text-xs"
              color="blue"
            >
              {lbl}
            </Tag>
          ))}
        </div>
      )}

      <Select
        mode="multiple"
        allowClear
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={labelsLoading ? "Loading labels…" : placeholder}
        showSearch
        filterOption={false}
        onSearch={handleSearch}
        notFoundContent={null}
        style={{ width: "100%" }}
        tagRender={({ value: tagValue, closable, onClose }) => (
          <Tag closable={closable} onClose={onClose} className="text-xs" color="blue">
            {tagValue}
          </Tag>
        )}
        maxTagCount={hideSelectedInInput ? 0 : undefined}
        maxTagPlaceholder={hideSelectedInInput ? () => null : undefined}
        optionRender={(option) => (
          <span className="text-sm">{option.data.label}</span>
        )}
        suffixIcon={labelsLoading ? <Spin size="small" /> : <SearchOutlined />}
        options={filteredPamOptions}
        virtual={false}
      />

      {showList && (
        <div
          className={[
            embedded
              ? "bg-transparent overflow-hidden"
              : "rounded-xl border border-gray-200 bg-linear-to-b from-white to-gray-50/60 overflow-hidden",
            fillHeight ? "flex-1 min-h-0 flex flex-col" : "",
          ].join(" ")}
        >
          {/* Header */}
          <div
            className={[
              "px-4 py-3 border-b border-gray-100 bg-white",
              fillHeight ? "shrink-0" : "",
              embedded ? "rounded-t-lg" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-ibm-mono font-semibold text-gray-700">Available labels</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Click to add/remove. Search filters the label list.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-gray-500">
                  {searchQuery.trim()
                    ? `${combinedList.length} match${combinedList.length === 1 ? "" : "es"}`
                    : `${Math.min(quickLabels.length, MAX_VISIBLE_LABELS)} labels`}
                </span>
                {value.length > 0 && (
                  <Button
                    size="small"
                    type="text"
                    onClick={clearAll}
                    disabled={disabled || labelsLoading}
                    className="text-[11px]"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

          </div>

          {/* Body */}
          <div
            className={[
              "px-3 py-3",
              fillHeight ? "flex-1 min-h-0 overflow-auto" : "max-h-95 overflow-auto",
            ].join(" ")}
          >
            {combinedList.length === 0 ? (
              <div className="p-3">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span className="text-xs text-gray-400">No matching labels</span>}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  {searchQuery.trim() && (
                    <div className="px-1 mb-2 text-[11px] text-gray-400 text-right">
                      {filteredPamOptions.length} match{filteredPamOptions.length === 1 ? "" : "es"}
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredPamOptions.slice(0, MAX_VISIBLE_LABELS).map((opt) => {
                      const isSelected = selectedSet.has(opt.value.toLowerCase());
                      return (
                        <button
                          key={`pam:${opt.value}`}
                          type="button"
                          disabled={disabled || labelsLoading}
                          onClick={() => toggle(opt.value)}
                          className={[
                            "group inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all",
                            isSelected
                              ? "bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-300 hover:bg-blue-50"
                              : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                            disabled || labelsLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                            !disabled && !labelsLoading ? "hover:shadow-sm hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-blue-200" : "",
                          ].join(" ")}
                          title="labels.json"
                        >
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
