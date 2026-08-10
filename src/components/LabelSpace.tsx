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
} from "../redux/features/customTaxonomySlice";
import { useEnsureTeamTaxonomies } from "../hooks/useEnsureTeamTaxonomies";
import { useTeamOwnership } from "../hooks/useTeamOwnership";
import { createAnnotation } from "../redux/features/annotationSlice";
import { fetchActiveLabelSpace } from "../redux/features/labelSpaceVersionSlice";
import { FreezeLabelSpace } from "./FreezeLabelSpace";
import { LabelSpaceVersions } from "./LabelSpaceVersions";

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

interface LabelSpaceProps {
  /**
   * Team that owns the selected dataset (pre-annotation screen). Resolved by the
   * parent from the chosen dataset so admins and users with datasets across
   * several teams see the active version for whichever dataset they pick — not
   * their first team.
   */
  teamId?: number;
}

export const LabelSpace: React.FC<LabelSpaceProps> = ({
  teamId: teamIdProp,
}) => {
  const [search, setSearch] = useState("");
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  // Custom taxonomy sources
  const { labelSpace, conversation, labelRemoved, allTaxonomies } =
    useAppSelector((state) => state.customTaxonomy);
  const { user } = useAppSelector((state) => state.auth);
  const { activeVersion } = useAppSelector((state) => state.labelSpaceVersion);
  const annotateTeamId = user?.team_ids?.length
    ? user.team_ids[0]
    : Number(localStorage.getItem("preAnnotationTeamId")) || 1;
  useEnsureTeamTaxonomies(annotateTeamId, pathname === "/annotate");

  // Team whose active label-space version to show on the right. Driven strictly
  // by the parent (resolved from the selected dataset) so switching datasets
  // switches the team. We deliberately do NOT fall back to the conversation's
  // team here: the backend derives a first-team fallback for teamless datasets,
  // which would pin the panel to one team and stop it tracking the selection.
  const preAnnotationTeamId: number | undefined = teamIdProp;

  const isPreAnnotation = pathname === "/pre-annotation";

  // Role for the pre-annotation right panel. Everyone gets the editable current
  // label space (pinned at the top); owners/admins additionally get the versions
  // (review + promote) panel below it.
  const { isOwner } = useTeamOwnership(preAnnotationTeamId);
  const showVersions = isPreAnnotation && isOwner === true;

  // Load the team's active version on the pre-annotation screen — it drives both
  // the versions panel and the "new vs existing" styling on the current list.
  useEffect(() => {
    if (isPreAnnotation && preAnnotationTeamId != null) {
      dispatch(fetchActiveLabelSpace(preAnnotationTeamId));
    }
  }, [isPreAnnotation, preAnnotationTeamId, dispatch]);

  // Taxon ids already in the active version — anything in the current label
  // space that isn't here is a label the user has newly added this session.
  const activeTaxonIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of activeVersion?.taxonomy_data?.nodes ?? []) {
      const key = (n.taxon_id ?? n.id ?? "").toString().toLowerCase();
      if (key) set.add(key);
    }
    return set;
  }, [activeVersion]);

  // Submit ("propose new version") is available once the current label space has
  // at least one label, or after it's been submitted (frozen).
  const showSubmit =
    isPreAnnotation &&
    ((labelSpace ?? []).length > 0 || conversation?.is_frozen === true);
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

  // On pre-annotation, distinguish labels seeded from the current active
  // version ("existing") from ones the user just added this session ("new").
  const showVersionDiff = pathname === "/pre-annotation" && activeTaxonIds.size > 0;

  const renderLabelItem = (label: DisplayItem) => {
    const rowInteractive = pathname === "/annotate";
    const handleRowClick = () => {
      if (rowInteractive) {
        handleSubmit(label);
      }
    };
    const labelKey = (label.taxon_id || label.id || "").toString().toLowerCase();
    const isExisting = showVersionDiff && activeTaxonIds.has(labelKey);
    const isNew = showVersionDiff && !isExisting;
    return (
      <div
        role={rowInteractive ? "button" : undefined}
        tabIndex={rowInteractive ? 0 : undefined}
        onClick={rowInteractive ? handleRowClick : undefined}
        onKeyDown={
          rowInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRowClick();
                }
              }
            : undefined
        }
        className={`w-full py-1.5 flex items-center justify-between rounded px-1 -mx-1 transition-colors ${
          rowInteractive ? "cursor-pointer hover:bg-gray-100" : ""
        } ${isNew ? "bg-green-50 border-l-2 border-green-400 pl-2" : ""}`}
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
            {isNew && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                New
              </span>
            )}
            {isExisting && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                Existing
              </span>
            )}

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
          <Tooltip title="Remove from label space">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFromLabelSpace(label.id);
              }}
              aria-label="Remove from label space"
              className="w-6 h-6 flex items-center justify-center rounded-md ml-3 shrink-0 cursor-pointer"
            >
              <Tag key="red" color="red" variant="filled">
                x
              </Tag>
            </button>
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

  if (isPreAnnotation) {
    return (
      <div className="w-full flex flex-col h-full min-h-0">
        {/* Current label space — pinned at the top, editable while chatting. */}
        <h3 className="text-m font-semibold mb-1 font-ibm-sans shrink-0">
          Current Label Space
          {(labelSpace ?? []).length > 0 ? ` (${labelSpace.length})` : ""}
        </h3>
        <div
          className={`border border-gray-200 rounded-md px-3 py-3 flex flex-col min-h-0 ${
            showVersions ? "shrink-0 max-h-[45%]" : "flex-1"
          }`}
        >
          <div className="text-xs text-gray-500 mb-2 shrink-0">
            Add labels from the chat or remove them with ×, then submit to propose
            a new version.
            {showVersionDiff && (
              <>
                {" "}
                Labels marked{" "}
                <span className="font-semibold text-green-700">New</span> are your
                additions.
              </>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <List
              dataSource={customItems}
              size="small"
              split={false}
              locale={{ emptyText: "No labels yet. Add them from the chat." }}
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

          {showSubmit && (
            <div className="mt-2 pt-2 border-t border-gray-100 shrink-0">
              <FreezeLabelSpace labelSpace={labelSpace ?? []} />
            </div>
          )}
        </div>

        {/* Versions review + promote — owners/admins only, below the current list. */}
        {showVersions && (
          <>
            <h3 className="text-m font-semibold mt-4 mb-1 font-ibm-sans shrink-0">
              Label Space Versions
            </h3>
            <div className="border border-gray-200 rounded-md px-3 py-4 flex flex-col flex-1 min-h-0">
              <LabelSpaceVersions teamId={preAnnotationTeamId} />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full min-h-0">
      <div className="flex flex-col h-full min-h-0">
        <h3 className="text-m font-semibold mb-1 font-ibm-sans shrink-0">
          Label Space
        </h3>

        <div className="border border-gray-200 rounded-md px-3 py-4 flex flex-col flex-1 min-h-0">
          <div className="mb-2 shrink-0">
            <input
              placeholder="Search custom + online suggestions"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            />

            {showMerged && suggestionsLoading && (
              <div className="text-xs text-gray-500 mt-1">Searching online…</div>
            )}

            {!showMerged && (
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
              locale={{ emptyText: "No matching taxonomies found." }}
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
      </div>
    </div>
  );
};
