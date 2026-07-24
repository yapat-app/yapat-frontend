/**
 * LabelSelector — multi-label picker for the "blind" labeling mode.
 *
 * Sources:
 *  1. Dataset-wide quick-label list supplied by the owning page.
 *
 * The component exposes `value` / `onChange` so it plugs directly into AntD
 * Form or can be used standalone.
 */

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { Select, Input, Tag, Spin, Tooltip, Empty, Button } from "antd";
import { SearchOutlined, GlobalOutlined } from "@ant-design/icons";
import { studyLogger } from "../../studyLogging";

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
  const [gbifResults, setGbifResults] = useState<GBIFSuggestion[]>([]);
  const [gbifLoading, setGbifLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Anchor the search dropdown to the input via a portal so it can grow and
  // scroll freely instead of being clipped by the bounded label panel it lives
  // inside. We track the input's viewport rect and position the dropdown fixed.
  const searchAnchorRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending timer on unmount to avoid orphaned GBIF fetches setting state
  // on an unmounted component when the label selector is opened and closed quickly.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
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

  const pamOptions = useMemo(
    () => quickLabels.map((sp) => ({ value: sp, label: sp, source: "pam" as const })),
    [quickLabels],
  );

  // De-duplicate GBIF results against the PAM list.
  const pamSet = useMemo(
    () => new Set(quickLabels.map((s) => s.toLowerCase())),
    [quickLabels],
  );
  const gbifOptions = useMemo(
    () =>
      gbifResults
        .filter((r) => {
          const name = r.canonicalName ?? r.scientificName;
          return name && !pamSet.has(name.toLowerCase());
        })
        .map((r) => {
          const name = r.canonicalName ?? r.scientificName;
          return { value: name, label: name, source: "gbif" as const, rank: r.rank };
        }),
    [gbifResults, pamSet],
  );

  const searchQueryLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const filteredPamOptions = useMemo(
    () =>
      searchQuery
        ? pamOptions.filter((o) => o.value.toLowerCase().includes(searchQueryLower))
        : pamOptions,
    [pamOptions, searchQuery, searchQueryLower],
  );

  // Search dropdown options: PAM matches, plus GBIF suggestions once the user
  // has typed 2+ characters. Capped so the dropdown stays snappy.
  const compactSearchOptions = useMemo(() => {
    if (searchQuery.trim().length < 2) return filteredPamOptions;
    return [...filteredPamOptions, ...gbifOptions].slice(0, 20);
  }, [searchQuery, filteredPamOptions, gbifOptions]);

  const searchDropdownOpen =
    searchFocused &&
    searchQuery.trim().length >= 1 &&
    (gbifLoading || compactSearchOptions.length > 0 || searchQuery.trim().length >= 2);

  // Keep the portalled dropdown pinned to the input as the page scrolls/resizes.
  useLayoutEffect(() => {
    if (!searchDropdownOpen) return;
    const update = () => {
      const el = searchAnchorRef.current;
      if (el) setAnchorRect(el.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [searchDropdownOpen]);

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

  const addLabel = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || !onChange) return;
    const normalized = value ?? [];
    if (normalized.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return;
    studyLogger.log("label_toggle", {
      label: trimmed,
      op: "add",
      labelsAfter: [...normalized, trimmed],
    });
    onChange([...normalized, trimmed]);
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

        {/* ── Search — plain input (always typable); GBIF + label list in a
            portalled dropdown so it escapes the bounded panel's clipping ── */}
        <div ref={searchAnchorRef} className="shrink-0">
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && searchQuery.trim()) {
                e.preventDefault();
                const q = searchQuery.trim();
                const match =
                  compactSearchOptions.find(
                    (o) => o.value.toLowerCase() === q.toLowerCase(),
                  ) ?? compactSearchOptions[0];
                addLabel(match?.value ?? q);
                setSearchQuery("");
                setGbifResults([]);
              }
            }}
            disabled={disabled}
            placeholder={labelsLoading ? "Loading labels…" : "Search species (GBIF)…"}
            suffix={labelsLoading ? <Spin size="small" /> : <SearchOutlined />}
            allowClear
          />
        </div>
        {searchDropdownOpen &&
          anchorRect &&
          (() => {
            const GAP = 4;
            const spaceBelow = window.innerHeight - anchorRect.bottom - GAP;
            const spaceAbove = anchorRect.top - GAP;
            // Flip above only when there's clearly more room up top.
            const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
            const maxHeight = Math.max(
              120,
              Math.min(320, (placeAbove ? spaceAbove : spaceBelow) - 8),
            );
            const positionStyle: React.CSSProperties = placeAbove
              ? { bottom: window.innerHeight - anchorRect.top + GAP }
              : { top: anchorRect.bottom + GAP };
            return createPortal(
              <ul
                className="fixed z-[1100] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm"
                style={{
                  ...positionStyle,
                  left: anchorRect.left,
                  width: anchorRect.width,
                  maxHeight,
                }}
                // Keep the input focused (dropdown open) while interacting.
                onMouseDown={(e) => e.preventDefault()}
              >
              {gbifLoading && (
                <li className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <Spin size="small" /> Searching GBIF…
                </li>
              )}
              {!gbifLoading &&
                compactSearchOptions.map((opt) => (
                  <li key={`${opt.source}:${opt.value}`}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center justify-between gap-2"
                      onClick={() => {
                        addLabel(opt.value);
                        setSearchQuery("");
                        setGbifResults([]);
                      }}
                    >
                      <span>
                        {selectedSet.has(opt.value.toLowerCase()) ? "✓ " : ""}
                        {opt.label}
                      </span>
                      {opt.source === "gbif" && (
                        <GlobalOutlined className="text-green-500 text-xs shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              {!gbifLoading &&
                searchQuery.trim().length >= 2 &&
                compactSearchOptions.length === 0 && (
                  <li className="px-3 py-2 text-xs text-gray-400 italic">
                    No results — press Enter to use &quot;{searchQuery.trim()}&quot;
                  </li>
                )}
              </ul>,
              document.body,
            );
          })()}

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
