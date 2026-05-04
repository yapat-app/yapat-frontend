/**
 * LabelSelector — multi-label picker for the "blind" labeling mode (P1.1).
 *
 * Sources:
 *  1. PAM species list fetched from the backend (checkpoint-specific or default).
 *  2. GBIF species name-suggest API for free-text search.
 *
 * The component exposes `value` / `onChange` so it plugs directly into AntD
 * Form or can be used standalone.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Select, Tag, Spin, Tooltip, Empty, Button } from "antd";
import { SearchOutlined, GlobalOutlined } from "@ant-design/icons";
import { alApi } from "../../services/alApi";

const GBIF_SUGGEST_URL = "https://api.gbif.org/v1/species/suggest";
const GBIF_DEBOUNCE_MS = 350;
const MAX_VISIBLE_LABELS = 300;

interface GBIFSuggestion {
  key: number;
  scientificName: string;
  canonicalName?: string;
  rank?: string;
  status?: string;
}

interface Props {
  value?: string[];
  onChange?: (labels: string[]) => void;
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
  disabled = false,
  placeholder = "Search species…",
  showList = true,
  hideSelectedInInput = true,
  showSelectedRow = true,
  embedded = false,
  fillHeight = false,
  compact = false,
}) => {
  const [pamSpecies, setPamSpecies] = useState<string[]>([]);
  const [pamLoading, setPamLoading] = useState(false);

  const [gbifResults, setGbifResults] = useState<GBIFSuggestion[]>([]);
  const [gbifLoading, setGbifLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the user-study label list from the backend (`data/labels.json`).
  useEffect(() => {
    setPamLoading(true);
    alApi
      .getDefaultSpecies()
      .then(setPamSpecies)
      .catch(() => {
        // Silently fall back to empty list; GBIF search is still available.
        setPamSpecies([]);
      })
      .finally(() => setPamLoading(false));
  }, []);

  const searchGBIF = useCallback((query: string) => {
    if (!query || query.trim().length < 2) {
      setGbifResults([]);
      return;
    }
    setGbifLoading(true);
    fetch(`${GBIF_SUGGEST_URL}?q=${encodeURIComponent(query.trim())}&limit=10`)
      .then((r) => r.json())
      .then((data: GBIFSuggestion[]) => setGbifResults(Array.isArray(data) ? data : []))
      .catch(() => setGbifResults([]))
      .finally(() => setGbifLoading(false));
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => searchGBIF(query), GBIF_DEBOUNCE_MS);
  };

  // Build option groups:
  //  • PAM species list (always present)
  //  • GBIF matches (when user has typed ≥2 chars)
  const pamOptions = pamSpecies.map((sp) => ({ value: sp, label: sp, source: "pam" as const }));

  // De-duplicate GBIF results against PAM list.
  const pamSet = new Set(pamSpecies.map((s) => s.toLowerCase()));
  const gbifOptions = gbifResults
    .filter((r) => {
      const name = r.canonicalName ?? r.scientificName;
      return name && !pamSet.has(name.toLowerCase());
    })
    .map((r) => {
      const name = r.canonicalName ?? r.scientificName;
      return { value: name, label: name, source: "gbif" as const, rank: r.rank };
    });

  // Filter PAM options by search query for a snappy feel (AntD also filters, but this
  // ensures PAM options surface even during GBIF-debounce delay).
  const filteredPamOptions = searchQuery
    ? pamOptions.filter((o) =>
        o.value.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : pamOptions;

  const combinedList = useMemo(() => {
    // In the always-visible list, show the local label list always,
    // and append GBIF suggestions when the user is actively searching.
    const local = filteredPamOptions;
    const gbif = searchQuery.trim().length >= 2 ? gbifOptions : [];
    const merged = [...local, ...gbif];
    return merged.slice(0, MAX_VISIBLE_LABELS);
  }, [filteredPamOptions, gbifOptions, searchQuery]);

  const selectedSet = useMemo(() => new Set((value ?? []).map((v) => v.toLowerCase())), [value]);

  const toggle = (label: string) => {
    if (!onChange) return;
    const normalized = (value ?? []);
    const exists = normalized.some((x) => x.toLowerCase() === label.toLowerCase());
    onChange(exists ? normalized.filter((x) => x.toLowerCase() !== label.toLowerCase()) : [...normalized, label]);
  };

  // ── Compact inline mode ───────────────────────────────────────────────────
  if (compact) {
    const compactSearchHint = pamLoading
      ? "Loading labels…"
      : "Type 2+ letters to search species (GBIF)…";

    return (
      <div className={["flex flex-col gap-2", fillHeight ? "h-full min-h-0" : ""].join(" ")}>

        {/* ── Current labels — shown as dismissible AntD Tags ── */}
        {value.length > 0 ? (
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider font-ibm-sans">
                Your labels
              </span>
              <button
                type="button"
                onClick={() => onChange?.([])}
                disabled={disabled || pamLoading}
                className="text-[11px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {value.map((lbl) => (
                <Tag
                  key={lbl}
                  color="blue"
                  closable={!disabled && !pamLoading}
                  onClose={(e) => {
                    e.preventDefault();
                    toggle(lbl);
                  }}
                  className="text-xs font-semibold rounded-md px-2 py-0.5 m-0"
                >
                  {lbl}
                </Tag>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 text-[11px] text-gray-400 italic">
            No labels selected yet — pick one below.
          </div>
        )}

        {/* ── Search — GBIF lookup only; chip list never changes ── */}
        <Select
          mode="multiple"
          allowClear
          value={value}
          onChange={onChange}
          disabled={disabled || pamLoading}
          placeholder={pamLoading ? "Loading labels…" : "Search species (GBIF)…"}
          showSearch
          filterOption={false}
          // Prevent global/page-level key handlers (e.g. vim-like shortcuts) from
          // swallowing first keypresses while the user is typing in the search box.
          onKeyDown={(e) => e.stopPropagation()}
          onInputKeyDown={(e) => e.stopPropagation()}
          onSearch={handleSearch}
          searchValue={searchQuery}
          autoClearSearchValue
          notFoundContent={
            gbifLoading ? (
              <div className="flex items-center gap-2 p-2 text-xs text-gray-500">
                <Spin size="small" /> Searching GBIF…
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <div className="p-2 text-xs text-gray-400 italic">No results found.</div>
            ) : null
          }
          style={{ width: "100%" }}
          // Hide tag chips in the control (selection is shown in "Your labels" above).
          maxTagCount={0}
          maxTagPlaceholder={() => null}
          optionRender={(option) => {
            const opt = option.data as (typeof filteredPamOptions | typeof gbifOptions)[number];
            const isOptSelected = selectedSet.has((opt.value as string).toLowerCase());
            const source = (opt as any).source as "pam" | "gbif";
            return (
              <div className="flex items-center justify-between gap-2">
                <span className={["text-sm", isOptSelected ? "font-semibold text-blue-700" : "font-medium"].join(" ")}>
                  {isOptSelected ? "✓ " : ""}{opt.label}
                </span>
                {source === "gbif" && (
                  <Tooltip title="GBIF suggestion">
                    <GlobalOutlined className="text-green-500 text-xs" />
                  </Tooltip>
                )}
              </div>
            );
          }}
          suffixIcon={pamLoading ? <Spin size="small" /> : <SearchOutlined />}
          options={[...filteredPamOptions, ...(searchQuery.trim().length >= 2 ? gbifOptions : [])]}
          virtual={false}
        />
        <div className="text-[11px] text-gray-400 -mt-1">
          {compactSearchHint}
        </div>

        {/* ── Quick label chips — fixed list, never changes with search ── */}
        <div className="flex-shrink-0 flex items-center">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider font-ibm-sans">
            Quick labels
          </span>
          {pamLoading && <Spin size="small" className="ml-2" />}
        </div>

        <div
          className={[
            fillHeight ? "flex-1 min-h-0 overflow-y-auto" : "max-h-[160px] overflow-y-auto",
            "pr-0.5",
          ].join(" ")}
        >
          {pamOptions.length === 0 && !pamLoading ? (
            <p className="text-xs text-gray-400 italic">No labels available.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pamOptions.map((opt) => {
                const isSelected = selectedSet.has(opt.value.toLowerCase());
                return (
                  <button
                    key={`pam:${opt.value}`}
                    type="button"
                    disabled={disabled || pamLoading}
                    onClick={() => toggle(opt.value)}
                    title={isSelected ? `Remove "${opt.value}"` : `Add "${opt.value}"`}
                    className={[
                      "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-sm font-semibold transition-all duration-150 select-none",
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700",
                      disabled || pamLoading
                        ? "opacity-40 cursor-not-allowed"
                        : "cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300",
                    ].join(" ")}
                  >
                    <span className="truncate max-w-[180px]">{opt.value}</span>
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
            "flex flex-wrap gap-2 flex-shrink-0",
            fillHeight ? "max-h-[72px] overflow-auto pr-1" : "",
          ].join(" ")}
        >
          {value.map((lbl) => (
            <Tag
              key={lbl}
              closable={!disabled && !pamLoading}
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
        disabled={disabled || pamLoading}
        placeholder={pamLoading ? "Loading labels…" : placeholder}
        showSearch
        filterOption={false}
        onSearch={handleSearch}
        notFoundContent={
          gbifLoading ? (
            <div className="flex items-center gap-2 p-2 text-xs text-gray-500">
              <Spin size="small" /> Searching GBIF…
            </div>
          ) : null
        }
        style={{ width: "100%" }}
        tagRender={({ value: tagValue, closable, onClose }) => (
          <Tag closable={closable} onClose={onClose} className="text-xs" color="blue">
            {tagValue}
          </Tag>
        )}
        maxTagCount={hideSelectedInInput ? 0 : undefined}
        maxTagPlaceholder={hideSelectedInInput ? () => null : undefined}
        optionRender={(option) => {
          const opt = option.data as (typeof filteredPamOptions | typeof gbifOptions)[number];
          const source = (opt as any).source as "pam" | "gbif";
          return (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{opt.label}</span>
              <Tooltip title={source === "pam" ? "Label list (labels.json)" : "GBIF suggestion"}>
                {source === "gbif" ? <GlobalOutlined className="text-green-500 text-xs" /> : null}
              </Tooltip>
            </div>
          );
        }}
        suffixIcon={pamLoading ? <Spin size="small" /> : <SearchOutlined />}
        options={[...filteredPamOptions, ...(searchQuery.trim().length >= 2 ? gbifOptions : [])]}
        virtual={false}
      />

      {showList && (
        <div
          className={[
            embedded
              ? "bg-transparent overflow-hidden"
              : "rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/60 overflow-hidden",
            fillHeight ? "flex-1 min-h-0 flex flex-col" : "",
          ].join(" ")}
        >
          {/* Header */}
          <div
            className={[
              "px-4 py-3 border-b border-gray-100 bg-white",
              fillHeight ? "flex-shrink-0" : "",
              embedded ? "rounded-t-lg" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-ibm-mono font-semibold text-gray-700">Available labels</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Click to add/remove. Search shows results from the label list and GBIF.
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-gray-500">
                  {searchQuery.trim()
                    ? `${combinedList.length} match${combinedList.length === 1 ? "" : "es"}`
                    : `${Math.min(pamSpecies.length, MAX_VISIBLE_LABELS)} labels`}
                </span>
                {value.length > 0 && (
                  <Button
                    size="small"
                    type="text"
                    onClick={() => onChange?.([])}
                    disabled={disabled || pamLoading}
                    className="text-[11px]"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Source chips */}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                Label list
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                <GlobalOutlined className="text-[10px]" /> GBIF
              </span>
              {gbifLoading && (
                <span className="inline-flex items-center gap-2 text-gray-400">
                  <Spin size="small" /> Searching…
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div
            className={[
              "px-3 py-3",
              fillHeight ? "flex-1 min-h-0 overflow-auto" : "max-h-[380px] overflow-auto",
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
                {/* Group 1: label list */}
                <div>
                  <div className="px-1 mb-2 flex items-center justify-between">
                    <div className="text-[11px] text-gray-500 font-ibm-sans">Label list</div>
                    {searchQuery.trim() && (
                      <div className="text-[11px] text-gray-400">
                        {filteredPamOptions.length} match{filteredPamOptions.length === 1 ? "" : "es"}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredPamOptions.slice(0, MAX_VISIBLE_LABELS).map((opt) => {
                      const isSelected = selectedSet.has(opt.value.toLowerCase());
                      return (
                        <button
                          key={`pam:${opt.value}`}
                          type="button"
                          disabled={disabled || pamLoading}
                          onClick={() => toggle(opt.value)}
                          className={[
                            "group inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all",
                            isSelected
                              ? "bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-300 hover:bg-blue-50"
                              : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                            disabled || pamLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                            !disabled && !pamLoading ? "hover:shadow-sm hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-blue-200" : "",
                          ].join(" ")}
                          title="labels.json"
                        >
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Group 2: GBIF (only when searching) */}
                {searchQuery.trim().length >= 2 && gbifOptions.length > 0 && (
                  <div>
                    <div className="px-1 mb-2 flex items-center justify-between">
                      <div className="text-[11px] text-gray-500 font-ibm-sans">GBIF suggestions</div>
                      <div className="text-[11px] text-gray-400">{gbifOptions.length}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {gbifOptions.map((opt) => {
                        const isSelected = selectedSet.has(opt.value.toLowerCase());
                        return (
                          <button
                            key={`gbif:${opt.value}`}
                            type="button"
                            disabled={disabled || pamLoading}
                            onClick={() => toggle(opt.value)}
                            className={[
                              "group inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all",
                              isSelected
                                ? "bg-green-50 text-green-800 border-green-200 hover:border-green-300 hover:bg-green-50"
                                : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                              disabled || pamLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                              !disabled && !pamLoading ? "hover:shadow-sm hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-green-200" : "",
                            ].join(" ")}
                            title="GBIF"
                          >
                            <span className="truncate">{opt.label}</span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-green-700">
                              <GlobalOutlined className="text-[10px]" /> GBIF
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
