/**
 * LabelSelector — multi-label picker for the "blind" labeling mode.
 *
 * Sources:
 *  1. Dataset-wide quick-label list supplied by the owning page.
 *
 * The component exposes `value` / `onChange` so it plugs directly into AntD
 * Form or can be used standalone.
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Select, Input, Tag, Spin, Tooltip, Empty, Button } from "antd";
import {
  SearchOutlined,
  GlobalOutlined,
  CloseOutlined,
  PlusOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { studyLogger } from "../../studyLogging";
import { getSpeciesScientificName } from "../../constants/speciesLabels";
import { usePersonalQuickLabels } from "../../hooks/usePersonalQuickLabels";

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

/** Something the compact search can apply: a quick label or a GBIF suggestion. */
interface PickOption {
  value: string;
  source: "pam" | "gbif";
  rank?: string;
  taxonKey?: number;
}

/** Bold-highlight the first case-insensitive occurrence of `query` in `text`. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-100 text-inherit rounded-sm px-0">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
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
   * Transient status (e.g. "Saving…") rendered right-aligned in the always-
   * present "Quick labels" header row. It lives there rather than as its own
   * flow row so that showing or hiding it costs no vertical space: the label
   * panel is measured to size the spectrogram, so any height change there
   * resizes the spectrogram mid-annotation. Compact mode only.
   */
  statusSlot?: React.ReactNode;
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
  statusSlot,
  compact = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [gbifResults, setGbifResults] = useState<GBIFSuggestion[]>([]);
  const [gbifLoading, setGbifLoading] = useState(false);

  // Compact mode: when the quick labels don't fit, the chip area stays
  // non-scrolling with a "+N more" pill (so it's obvious labels are hidden);
  // the pill expands it into a scrollable list showing all of them.
  const chipAreaRef = useRef<HTMLDivElement | null>(null);
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [hiddenChipCount, setHiddenChipCount] = useState(0);

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

  // Labels this participant pinned from GBIF, plus any dataset-wide entries.
  const personal = usePersonalQuickLabels();

  // Chip list: the participant's own pinned labels first (server returns them
  // newest-first, hand-picked ahead of bulk imports), then the checkpoint /
  // dataset labels. Case-insensitive dedupe, first occurrence wins.
  const pamOptions = useMemo(() => {
    const out: {
      value: string;
      label: string;
      source: "pam";
      taxonId?: string;
      removable: boolean;
    }[] = [];
    const seen = new Set<string>();
    for (const entry of personal.entries) {
      const key = entry.display_name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        value: entry.display_name,
        label: entry.display_name,
        source: "pam",
        taxonId: entry.taxon_id,
        removable: entry.owned,
      });
    }
    for (const sp of quickLabels) {
      const key = sp.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: sp, label: sp, source: "pam", removable: false });
    }
    return out;
  }, [personal.entries, quickLabels]);

  // De-duplicate GBIF results against the chip list, so a species that is
  // already pinned stops showing up as a fresh suggestion.
  const pamSet = useMemo(
    () => new Set(pamOptions.map((o) => o.value.toLowerCase())),
    [pamOptions],
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
          return {
            value: name,
            label: name,
            source: "gbif" as const,
            rank: r.rank,
            taxonKey: r.key,
          };
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

  // Compact mode: quick labels matching the query (name or scientific name),
  // names that start with the query first so the likeliest hit is at the front.
  const trimmedQuery = searchQuery.trim();
  const quickMatches = useMemo(() => {
    if (!trimmedQuery) return pamOptions;
    const q = trimmedQuery.toLowerCase();
    const hits = pamOptions.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (getSpeciesScientificName(o.value) ?? "").toLowerCase().includes(q),
    );
    return hits.sort(
      (a, b) =>
        Number(!a.value.toLowerCase().startsWith(q)) -
        Number(!b.value.toLowerCase().startsWith(q)),
    );
  }, [pamOptions, trimmedQuery]);

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

  /**
   * Apply a search-dropdown option to the snippet, and — when it came from
   * GBIF — pin it to the participant's quick labels so the next snippet needs
   * no second search. Pinning is fire-and-forget: it must never delay or block
   * the label itself.
   */
  // Count quick-label chips cut off by the clipped (non-expanded) chip area.
  // Chips under the bottom fade count as hidden too, since the pill covers them.
  useEffect(() => {
    if (!compact) return;
    const el = chipAreaRef.current;
    if (!el) return;
    const FADE_PX = 36;
    const measure = () => {
      if (el.scrollHeight <= el.clientHeight + 1) {
        setHiddenChipCount(0);
        return;
      }
      const limit = el.getBoundingClientRect().bottom - FADE_PX;
      let hidden = 0;
      el.querySelectorAll<HTMLElement>('[data-qchip="pam"]').forEach((chip) => {
        if (chip.getBoundingClientRect().bottom > limit) hidden += 1;
      });
      setHiddenChipCount(hidden);
    };
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [compact, labelsExpanded, searchQuery, pamOptions, value]);

  const pickSearchOption = (opt: PickOption) => {
    addLabel(opt.value);
    if (opt.source === "gbif" && opt.taxonKey != null) {
      personal.promote({
        taxon_id: `gbif:${opt.taxonKey}`,
        display_name: opt.value,
        rank: opt.rank ?? null,
        source: "gbif",
      });
    }
    setSearchQuery("");
    setGbifResults([]);
  };

  // ── Compact inline mode ───────────────────────────────────────────────────
  if (compact) {
    const clearSearch = () => {
      setSearchQuery("");
      setGbifResults([]);
    };
    const chipsDisabled = disabled || labelsLoading;
    const gbifActive = trimmedQuery.length >= 2;
    // Searching (or after "+N more") the list scrolls; otherwise it's clipped
    // and the pill below reports how many chips are out of view.
    const chipsScrollable = labelsExpanded || Boolean(trimmedQuery);
    const showMorePill = !chipsScrollable && hiddenChipCount > 0;

    const applyQuery = () => {
      if (!trimmedQuery) return;
      const q = trimmedQuery.toLowerCase();
      const exactQuick = quickMatches.find((o) => o.value.toLowerCase() === q);
      const exactGbif = gbifOptions.find((o) => o.value.toLowerCase() === q);
      const pick: PickOption | undefined =
        exactQuick ?? exactGbif ?? quickMatches[0] ?? gbifOptions[0];
      if (pick) {
        pickSearchOption(pick);
      } else {
        // Free text with no match: label the snippet, but don't pin it, since
        // it isn't a resolved taxon.
        addLabel(trimmedQuery);
        clearSearch();
      }
    };

    const renderQuickChip = (
      opt: (typeof pamOptions)[number],
      keyPrefix: string,
    ) => {
      const isSelected = selectedSet.has(opt.value.toLowerCase());
      const scientificName = getSpeciesScientificName(opt.value);
      const chip = (
        // Wrapper so the remove control is a sibling of the chip button rather
        // than a nested (invalid) button.
        <span key={`${keyPrefix}:${opt.value}`} data-qchip={keyPrefix} className="group/chip relative inline-flex">
          <button
            type="button"
            disabled={chipsDisabled}
            onClick={() => {
              toggle(opt.value);
              if (trimmedQuery && !isSelected) clearSearch();
            }}
            aria-pressed={isSelected}
            title={scientificName ? undefined : isSelected ? `Remove "${opt.value}"` : `Add "${opt.value}"`}
            className={[
              "inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium transition-colors duration-100 select-none",
              isSelected
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700",
              // Labels the participant pinned from GBIF carry a green edge.
              opt.removable && !isSelected ? "border-l-[3px] border-l-green-500" : "",
              chipsDisabled
                ? "opacity-40 cursor-not-allowed"
                : "cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300",
            ].join(" ")}
          >
            <span className="truncate max-w-40">
              {isSelected ? opt.value : highlight(opt.value, trimmedQuery)}
            </span>
          </button>
          {opt.removable && !chipsDisabled && (
            <button
              type="button"
              aria-label={`Remove "${opt.value}" from quick labels`}
              title="Remove from quick labels"
              onClick={(e) => {
                e.stopPropagation();
                if (opt.taxonId) personal.remove(opt.taxonId);
              }}
              className="absolute -top-1.5 -right-1.5 hidden group-hover/chip:flex items-center justify-center h-4 w-4 rounded-full bg-gray-600 text-white text-fs-8 shadow hover:bg-red-500"
            >
              <CloseOutlined />
            </button>
          )}
        </span>
      );
      return scientificName ? (
        <Tooltip key={`${keyPrefix}:${opt.value}`} title={scientificName}>
          {chip}
        </Tooltip>
      ) : (
        chip
      );
    };

    const sectionTitle = (icon: React.ReactNode, text: React.ReactNode) => (
      <div className="flex items-center gap-1.5 mb-1.5 text-fs-10 font-semibold uppercase tracking-wider text-gray-400 font-ibm-sans">
        {icon}
        {text}
      </div>
    );

    return (
      <div data-tour="labeling" className={["flex flex-col gap-2", fillHeight ? "h-full min-h-0" : ""].join(" ")}>

        {/* ── Current labels — shown as dismissible AntD Tags ── */}
        {value.length > 0 && (
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-fs-11 laptop:text-[9.5px]! laptop:tracking-wide! font-semibold text-gray-500 uppercase tracking-wider font-ibm-sans">
                Labels
              </span>
              <button
                type="button"
                onClick={clearAll}
                disabled={disabled}
                className="text-fs-11 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
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

        {/* ── Search: filters the quick labels below in place, and from 2+
            letters also looks the name up in GBIF (shown as its own section) ── */}
        <div className="shrink-0">
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                applyQuery();
              } else if (e.key === "Escape") {
                clearSearch();
              }
            }}
            disabled={disabled}
            placeholder={labelsLoading ? "Loading labels…" : "Find a label, or search GBIF…"}
            prefix={<SearchOutlined className="text-gray-400" />}
            suffix={labelsLoading ? <Spin size="small" /> : null}
            allowClear
          />
        </div>

        {/* ── Header: count + transient status (fixed row, no layout shift) ── */}
        <div className="shrink-0 flex items-center justify-between gap-2 min-h-5">
          <span className="text-fs-11 laptop:text-[9.5px]! laptop:tracking-wide! font-semibold text-gray-400 uppercase tracking-wider font-ibm-sans">
            {trimmedQuery
              ? `${quickMatches.length} of ${pamOptions.length} quick labels`
              : `Quick labels${pamOptions.length ? ` · ${pamOptions.length}` : ""}`}
            {labelsLoading && <Spin size="small" className="ml-2" />}
            {labelsExpanded && !trimmedQuery && (
              <button
                type="button"
                onClick={() => {
                  setLabelsExpanded(false);
                  chipAreaRef.current?.scrollTo({ top: 0 });
                }}
                className="ml-2 normal-case tracking-normal font-medium text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline cursor-pointer"
              >
                Show less
              </button>
            )}
          </span>
          {statusSlot ??
            (trimmedQuery ? (
              <span className="text-fs-10 text-gray-400 whitespace-nowrap">
                Enter adds the first match · Esc clears
              </span>
            ) : null)}
        </div>

        <div className={["relative", fillHeight ? "flex-1 min-h-0" : ""].join(" ")}>
        <div
          ref={chipAreaRef}
          className={[
            fillHeight ? "h-full" : "max-h-40",
            chipsScrollable ? "overflow-y-auto" : "overflow-hidden",
            "pr-0.5 flex flex-col gap-3",
          ].join(" ")}
        >
          {pamOptions.length === 0 && !labelsLoading && !trimmedQuery ? (
            <p className="text-xs text-gray-400 italic">
              No quick labels yet. Search above to find a species in GBIF; it is pinned here once used.
            </p>
          ) : (
            <>
              <div>
                {quickMatches.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {quickMatches.map((opt) => renderQuickChip(opt, "pam"))}
                  </div>
                ) : trimmedQuery ? (
                  <p className="text-xs text-gray-400">
                    No quick label matches &quot;{trimmedQuery}&quot;.
                  </p>
                ) : null}
              </div>
            </>
          )}

          {trimmedQuery.length === 1 && (
            <p className="text-fs-11 text-gray-400">Type one more letter to also search GBIF.</p>
          )}

          {gbifActive && (
            <div className="rounded-md border border-dashed border-green-300 bg-green-50/40 px-2 py-1.5">
              {sectionTitle(
                <GlobalOutlined className="text-green-600" />,
                <span className="text-green-700">More species from GBIF (online)</span>,
              )}
              {gbifLoading ? (
                <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <Spin size="small" /> Searching GBIF…
                </span>
              ) : gbifOptions.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {gbifOptions.map((opt) => (
                      <button
                        key={`gbif:${opt.taxonKey}:${opt.value}`}
                        type="button"
                        disabled={chipsDisabled}
                        onClick={() => pickSearchOption(opt)}
                        title={`Add "${opt.value}" and pin it to your quick labels`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-green-300 bg-white text-xs text-gray-700 hover:border-green-500 hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <PlusOutlined className="text-fs-10 text-green-600" />
                        <span className="truncate max-w-40">{highlight(opt.value, trimmedQuery)}</span>
                        {opt.rank && (
                          <span className="text-fs-9 uppercase tracking-wide text-gray-400">
                            {opt.rank.toLowerCase()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-fs-10 text-gray-400">
                    Adding one also pins it to your quick labels.
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-400">
                  No GBIF results. Press Enter to use &quot;{trimmedQuery}&quot; as written.
                </p>
              )}
            </div>
          )}
        </div>
          {showMorePill && (
            // Fade over the cut-off row + pill; clicking expands to a scrollable list.
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-linear-to-t from-white via-white/90 to-transparent pb-1">
              <button
                type="button"
                onClick={() => setLabelsExpanded(true)}
                className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-0.5 text-fs-11 font-medium text-gray-700 shadow-sm hover:border-gray-400 hover:text-gray-900 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                +{hiddenChipCount} more
                <DownOutlined className="text-[9px]" />
              </button>
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
                <div className="text-fs-11 text-gray-400 mt-0.5">
                  Click to add/remove. Search filters the label list.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-fs-11 text-gray-500">
                  {searchQuery.trim()
                    ? `${combinedList.length} match${combinedList.length === 1 ? "" : "es"}`
                    : `${Math.min(pamOptions.length, MAX_VISIBLE_LABELS)} labels`}
                </span>
                {value.length > 0 && (
                  <Button
                    size="small"
                    type="text"
                    onClick={clearAll}
                    disabled={disabled || labelsLoading}
                    className="text-fs-11"
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
                    <div className="px-1 mb-2 text-fs-11 text-gray-400 text-right">
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
