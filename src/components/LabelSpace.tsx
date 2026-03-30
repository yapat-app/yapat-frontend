import { List, Tag, Tooltip, message } from "antd";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { debounce } from "lodash";
import { useAppSelector, useAppDispatch } from "../hooks";
import type { AnnotationCreate } from "../types";

import {
  getLabelSpace,
  reset,
  removeLabels,
  getAllTaxonomies,
} from "../redux/features/customTaxonomySlice";
import { createAnnotation } from "../redux/features/annotationSlice";
import { FreezeLabelSpace } from "./FreezeLabelSpace";

import {
  getSuggestions,
  clearSuggestions,
} from "../redux/features/taxonomySlice";
interface LabelSpaceItem {
  id: string;
  name: string;
  scientific_name: string;
  canonical_name?: string;
  taxon_id: string;
  metadata: {
    iri?: string;
    rank?: string;
    tool?: string;
    score?: null | number;
    family?: null | string;
    source?: string;
    kingdom?: null | string;
    description?: null | string;
  };
  added_at?: string;
  status?: string;
}

type DisplayItem = LabelSpaceItem & { __source: "custom" | "suggested" };

const normalizeText = (s: string) => (s || "").toLowerCase().trim();

const matchesSearch = (item: LabelSpaceItem, q: string) => {
  if (!q) return true;
  const haystack = normalizeText(
    [
      item.name,
      item.scientific_name,
      item.canonical_name ?? "",
      item.taxon_id,
      item.metadata?.rank ?? "",
      item.metadata?.kingdom ?? "",
      item.metadata?.source ?? "",
    ].join(" "),
  );
  return haystack.includes(normalizeText(q));
};

const dedupeByTaxonId = (items: DisplayItem[]) => {
  const seen = new Set<string>();
  const out: DisplayItem[] = [];

  for (const it of items) {
    const key = (it.taxon_id || it.id || it.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
};

export const LabelSpace: React.FC = () => {
  const [search, setSearch] = useState("");
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  // Custom taxonomy sources
  const { labelSpace, conversation, labelRemoved, allTaxonomies } =
    useAppSelector((state) => state.customTaxonomy);

  // Online suggestions (GBIF etc.)
  const { suggestions, loading: suggestionsLoading } = useAppSelector(
    (state) => state.taxonomy,
  );

  const { currentSnippet } = useAppSelector((state: any) => state.snippet);

  // Load conversation label space once when entering pre-annotation screen
  const [loadedConversationId, setLoadedConversationId] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (
      pathname === "/pre-annotation" &&
      conversation?.id &&
      conversation.id !== loadedConversationId
    ) {
      dispatch(getLabelSpace(conversation.id));
      setLoadedConversationId(conversation.id);
    }
  }, [pathname, conversation?.id, dispatch, loadedConversationId]);

  // Load saved/custom taxonomies for annotate screen
  useEffect(() => {
    if (pathname === "/annotate") {
      dispatch(getAllTaxonomies(1));
    }
  }, [pathname, dispatch]);

  // Show toast and refresh after removing a label (taxonomy screen)
  useEffect(() => {
    if (labelRemoved) {
      message.success("Label Removed", undefined, () => dispatch(reset()));
      if (conversation?.id) dispatch(getLabelSpace(conversation.id));
    }
  }, [labelRemoved, conversation?.id, dispatch]);

  // Debounced online search while typing in annotate screen
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      if (pathname !== "/annotate") return;

      const q = query.trim();
      if (q.length < 2) {
        dispatch(clearSuggestions());
        return;
      }

      dispatch(getSuggestions({ query: q, limit: 10 }));
    }, 300),
    [dispatch, pathname],
  );

  // Update search text and trigger online search
  const onSearchChange = (val: string) => {
    setSearch(val);

    if (pathname === "/annotate" && val.trim().length < 2) {
      dispatch(clearSuggestions());
    }

    debouncedSearch(val);
  };

  // Base list depends on the screen:
  // - /annotate uses saved custom taxonomies (allTaxonomies)
  // - /pre-annotation uses conversation label space (labelSpace)
  const baseCustomList: any[] = useMemo(() => {
    if (pathname === "/annotate")
      return allTaxonomies?.[0]?.taxonomy_data?.nodes ?? [];
    return labelSpace ?? [];
  }, [pathname, allTaxonomies, labelSpace]);

  // Normalize custom list items
  const customItems: DisplayItem[] = useMemo(() => {
    return (baseCustomList ?? []).map((x: any) => ({
      id: x.id,
      name: x.name,
      scientific_name: x.scientific_name,
      canonical_name: x.canonical_name ?? x.name,
      taxon_id: (x.taxon_id ?? x.id)?.toString(),
      metadata: x.metadata ?? {},
      added_at: x.added_at,
      status: x.status,
      __source: "custom",
    }));
  }, [baseCustomList]);

  // Normalize online suggestion items
  const suggestedItems: DisplayItem[] = useMemo(() => {
    return (suggestions ?? []).map((t: any) => ({
      id: t.taxon_id,
      name: t.canonical_name || t.scientific_name || "",
      scientific_name: t.scientific_name || "",
      canonical_name: t.canonical_name || t.scientific_name || "",
      taxon_id: t.taxon_id,
      metadata: {
        rank: t.rank,
        kingdom: t.kingdom,
        source: "GBIF",
        tool: "taxonomy-suggestions",
      },
      status: t.status,
      __source: "suggested",
    }));
  }, [suggestions]);

  // Merge only when user is actually searching on /annotate
  const showMerged = pathname === "/annotate" && search.trim().length >= 2;

  const listItems: DisplayItem[] = useMemo(() => {
    if (!showMerged) return customItems;
    return dedupeByTaxonId([...customItems, ...suggestedItems]);
  }, [showMerged, customItems, suggestedItems]);

  const filteredItems: DisplayItem[] = useMemo(() => {
    if (!search.trim()) return listItems;
    return listItems.filter((it) => matchesSearch(it, search));
  }, [listItems, search]);

  // Create annotation from selected taxonomy
  const handleSubmit = async (label: LabelSpaceItem) => {
    try {
      if (!currentSnippet?.id) {
        message.error("No snippet selected to annotate.");
        return;
      }

      const annotationData: AnnotationCreate = {
        snippet_id: currentSnippet.id,
        taxon_id: label.taxon_id.toLowerCase(),
        display_name:
          label.canonical_name || label.scientific_name || label.name,
      };

      await dispatch(createAnnotation(annotationData)).unwrap();

      message.success(
        `Annotated: ${label.canonical_name || label.scientific_name || label.name}`,
      );
    } catch (error: any) {
      message.error(error || "Failed to create annotation");
    }
  };

  // Remove a label from label space (taxonomy screen)
  const handleRemoveFromLabelSpace = async (itemId: any) => {
    if (!conversation?.id) {
      message.error("No active conversation");
      return;
    }

    dispatch(
      removeLabels({
        conversationId: conversation.id,
        itemId,
      }),
    );
  };

  const renderLabelItem = (label: DisplayItem) => {
    const handleRowClick = () => {
      if (pathname === "/annotate") {
        handleSubmit(label);
      } else {
        handleRemoveFromLabelSpace(label.id);
      }
    };
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
        className=" w-full py-1.5 flex items-center justify-between  cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <span className="font-ibm-sans text-sm! text-gray-900">
                {label.canonical_name || label.scientific_name || label.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap ">
            {/* Show source only while merged search results are active */}
            {pathname === "/annotate" && showMerged && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                  label.__source === "custom"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {label.__source === "custom" ? "Custom" : "Suggested"}
              </span>
            )}

            {label.metadata?.rank && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                {label.metadata.rank}
              </span>
            )}

            {label.metadata?.kingdom && (
              <span className="text-xs text-gray-600">
                {label.metadata.kingdom}
              </span>
            )}

            {label.status && label.status !== "ACCEPTED" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
                {label.status}
              </span>
            )}

            {label.scientific_name &&
              label.canonical_name &&
              label.scientific_name !== label.canonical_name && (
                <span className="text-xs text-blue-600 italic">
                  {label.scientific_name}
                </span>
              )}
          </div>
        </div>

        {pathname !== "/pre-annotation" ? (
          <Tooltip title="Annotate (or click anywhere on row)">
            <span
              className="w-6 h-6 flex items-center justify-center rounded-md ml-3 shrink-0 pointer-events-none"
              aria-hidden
            >
              <Tag key="green" color="green" variant="filled">
                ✓ Annotate
              </Tag>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title="Remove (or click anywhere on row)">
            <span
              className="w-6 h-6 flex items-center justify-center   rounded-md ml-3 shrink-0 pointer-events-none"
              aria-hidden
            >
              <Tag key="red" color="red" variant="filled">
                x
              </Tag>
            </span>
          </Tooltip>
        )}
      </div>
    );
  };

  // Clear online suggestions when leaving annotate screen
  useEffect(() => {
    if (pathname !== "/annotate") {
      dispatch(clearSuggestions());
    }
  }, [pathname, dispatch]);

  return (
    <div className="w-full flex flex-col h-full min-h-0">
      <div className="flex flex-col h-full min-h-0">
        <h3 className="text-m font-semibold mb-1 font-ibm-sans shrink-0">
          Label Space
        </h3>

        <div className="border border-gray-200 rounded-md px-3 py-4 flex flex-col flex-1 min-h-0">
          <div className="mb-2 shrink-0">
            <input
              placeholder={
                pathname === "/annotate"
                  ? "Search custom + online suggestions"
                  : "Search labels"
              }
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            />

            {pathname === "/annotate" && showMerged && suggestionsLoading && (
              <div className="text-xs text-gray-500 mt-1">
                Searching online…
              </div>
            )}

            {pathname === "/annotate" && !showMerged && (
              <div className="text-xs text-gray-500 mt-1">
                Showing custom taxonomies. Type 2+ characters to include online
                suggestions.
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <List
              dataSource={filteredItems}
              size="small"
              split={false}
              locale={{
                emptyText:
                  pathname === "/annotate"
                    ? "No matching taxonomies found."
                    : "No labels found.",
              }}
              renderItem={(item) => (
                <List.Item
                  key={`${item.__source}-${item.id}`}
                  className="border-b border-gray-100 last:border-b-0 rounded"
                >
                  {renderLabelItem(item)}
                </List.Item>
              )}
            />
          </div>
        </div>
        {pathname === "/pre-annotation" && (labelSpace ?? []).length > 0 && (
          <div className="my-3">
            <FreezeLabelSpace labelSpace={labelSpace ?? []} />
          </div>
        )}
      </div>
    </div>
  );
};
