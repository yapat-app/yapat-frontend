/**
 * Workspace — the Annotation Hub's main content area, phase-aware.
 *
 * Every phase (P1–P5) renders through this one component. Layout and
 * interactivity are driven entirely by the resolved PhaseConfig: whether the
 * Feature Projection View renders at all, whether its points are clickable,
 * and which Sort fields are available. The feed itself always uses
 * PredictionFeed's blind/scrollable rendering path.
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { Tooltip, Button, Tag } from "antd";
import { AudioOutlined, ExpandAltOutlined } from "@ant-design/icons";
import { FullRecordingOverlay } from "../../components/fullRecording/FullRecordingOverlay";
import { ResizableSplit } from "../../components/layout/ResizableSplit";
import {
  ProjectionView,
  MiniProjection,
  type ProjectionMethod,
  type ProjectionThumbnailData,
} from "../../components/al/ProjectionView";
import { PredictionFeed } from "../../components/al/PredictionFeed";
import { SnippetHeader } from "./SnippetHeader";
import { SortPanel } from "./SortPanel";
import { defaultSortFields, makeSortFieldId } from "./sortPanelHelpers";
import { usePhaseConfig } from "../../studyPhases";
import { studyLogger } from "../../studyLogging";
import type { SortField } from "../../types/sort";
import type { ExploreFilters } from "../../types/explore";

const PROJECTION_METHODS: { key: ProjectionMethod; label: string }[] = [
  { key: "tsne", label: "t-SNE" },
  { key: "umap", label: "UMAP" },
  { key: "pca", label: "PCA" },
  // { key: "isomap", label: "Isomap" },
];

type WorkspaceProps = {
  onFindSimilar?: (snippetId: number) => void;
  /** Canonical explore filters shared by the feed, histograms and projection. */
  exploreFilters: ExploreFilters;
  /** Whether to render the feed action button at all (hidden once a feed exists). */
  showFeedAction?: boolean;
  /** Feed action button label — lives on the feed side. */
  feedActionLabel: string;
  feedActionLoading: boolean;
  feedActionDisabled: boolean;
  onFeedAction: () => void;
  quickLabels: string[];
  quickLabelsLoading: boolean;
  /** Species chosen in "Find species" (shared with the toolbar and sidebar). */
  focusSpecies?: string[];
  /** Species the active model can score; gates the legend shortcut. */
  focusableSpecies?: ReadonlySet<string>;
  /** Updates "Find species"; `source` records which control changed it. */
  onFocusSpeciesChange?: (species: string[], source: string) => void;
  /** Anchor snippet of the active "Find similar" search, or null. */
  similarTo?: number | null;
  /** Ends the "Find similar" search; `source` records which control did it. */
  onClearSimilar?: (source: string) => void;
};

const NO_FOCUS: string[] = [];

export const Workspace: React.FC<WorkspaceProps> = ({
  onFindSimilar,
  exploreFilters,
  showFeedAction = true,
  feedActionLabel,
  feedActionLoading,
  feedActionDisabled,
  onFeedAction,
  quickLabels,
  quickLabelsLoading,
  focusSpecies = NO_FOCUS,
  focusableSpecies,
  onFocusSpeciesChange,
  similarTo = null,
  onClearSimilar,
}) => {
  const phase = usePhaseConfig();
  const [projMethod, setProjMethod] = useState<ProjectionMethod>("pca");
  const [thumbData, setThumbData] = useState<ProjectionThumbnailData | null>(
    null,
  );
  const handleThumbnailData = useCallback((data: ProjectionThumbnailData) => {
    setThumbData(data);
  }, []);
  // UMAP/t-SNE disappear when the server can't produce them (over their point caps);
  // a selection of one of those falls back to PCA, which is always available.
  const effectiveProjMethod: ProjectionMethod =
    thumbData?.unavailableMethods.has(projMethod) ? "pca" : projMethod;
  const handleMethodChange = useCallback(
    (m: ProjectionMethod) => {
      if (m !== effectiveProjMethod)
        studyLogger.log("projection_method_change", {
          from: effectiveProjMethod,
          to: m,
        });
      setProjMethod(m);
    },
    [effectiveProjMethod],
  );

  const [sortFields, setSortFields] = useState<SortField[]>(() =>
    defaultSortFields(phase.sort.nonModel, phase.sort.model),
  );
  const activeSortFields = useMemo(
    () =>
      (sortFields ?? [])
        .filter((f) => !f.disabled)
        .map((f) => ({ property: f.property, direction: f.direction })),
    [sortFields],
  );
  const activeSortFieldsKey = useMemo(
    () => activeSortFields.map((f) => `${f.property}:${f.direction}`).join("|"),
    [activeSortFields],
  );
  const sortLogInitializedRef = useRef(false);
  const sortLogPhaseIdRef = useRef(phase.id);
  const sortLogLastKeyRef = useRef<string | null>(null);
  const sortLogTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (sortLogTimerRef.current !== null) {
      window.clearTimeout(sortLogTimerRef.current);
      sortLogTimerRef.current = null;
    }

    if (!sortLogInitializedRef.current) {
      sortLogInitializedRef.current = true;
      sortLogPhaseIdRef.current = phase.id;
      sortLogLastKeyRef.current = activeSortFieldsKey;
      return;
    }

    if (sortLogPhaseIdRef.current !== phase.id) {
      sortLogPhaseIdRef.current = phase.id;
      sortLogLastKeyRef.current = activeSortFieldsKey;
      return;
    }

    if (sortLogLastKeyRef.current === activeSortFieldsKey) return;

    const snapshotFields = activeSortFields;
    const snapshotKey = activeSortFieldsKey;

    sortLogTimerRef.current = window.setTimeout(() => {
      sortLogTimerRef.current = null;
      if (sortLogLastKeyRef.current === snapshotKey) return;
      sortLogLastKeyRef.current = snapshotKey;
      studyLogger.log("feed_sort_change", {
        action: "sort_change",
        panel: "prediction_feed",
        activeCount: snapshotFields.length,
        fields: snapshotFields,
      });
    }, 500);

    return () => {
      if (sortLogTimerRef.current !== null) {
        window.clearTimeout(sortLogTimerRef.current);
        sortLogTimerRef.current = null;
      }
    };
  }, [activeSortFields, activeSortFieldsKey, phase.id]);
  // Reset sort fields when the phase's capabilities change, following React's
  // "adjust state during render" pattern (avoids the extra effect-triggered
  // render an equivalent useEffect would cause).
  const [sortFieldsPhaseId, setSortFieldsPhaseId] = useState(phase.id);
  if (phase.id !== sortFieldsPhaseId) {
    setSortFieldsPhaseId(phase.id);
    setSortFields(defaultSortFields(phase.sort.nonModel, phase.sort.model));
  }

  // "Find species" ranks by the species' confidence: starting a focus switches
  // the feed to Confidence (high → low) so the likeliest snippets come first,
  // and clearing it restores the sort the user had before. Changing the chosen
  // species while focused keeps whatever sort is active (including manual
  // changes). Same "adjust state during render" pattern as the phase reset.
  const focusKey = focusSpecies.join("\u0000");
  const [prevFocusKey, setPrevFocusKey] = useState(focusKey);
  const [sortBeforeFocus, setSortBeforeFocus] = useState<SortField[] | null>(
    null,
  );
  if (focusKey !== prevFocusKey) {
    const wasFocused = prevFocusKey !== "";
    const isFocused = focusKey !== "";
    setPrevFocusKey(focusKey);
    if (phase.sort.model && !phase.sort.disabled) {
      if (!wasFocused && isFocused) {
        setSortBeforeFocus(sortFields);
        setSortFields([
          { id: makeSortFieldId(), property: "confidence", direction: "desc" },
        ]);
      } else if (wasFocused && !isFocused && sortBeforeFocus) {
        setSortFields(sortBeforeFocus);
        setSortBeforeFocus(null);
      }
    }
  }

  // "Find similar" works the same way: starting a search ranks the feed by
  // similarity (closest first) and ending it restores the earlier sort. Moving
  // the anchor to another snippet keeps whatever sort is active. The
  // Similarity chip only exists during a search, so it is always dropped at
  // the end, even when there was no earlier sort to restore.
  const similarityActive = similarTo !== null;
  const [prevSimilarityActive, setPrevSimilarityActive] =
    useState(similarityActive);
  const [sortBeforeSimilar, setSortBeforeSimilar] = useState<
    SortField[] | null
  >(null);
  if (similarityActive !== prevSimilarityActive) {
    setPrevSimilarityActive(similarityActive);
    if (similarityActive) {
      if (!phase.sort.disabled) {
        setSortBeforeSimilar(sortFields);
        setSortFields([
          { id: makeSortFieldId(), property: "similarity", direction: "desc" },
        ]);
      }
    } else {
      setSortFields(
        (sortBeforeSimilar ?? sortFields).filter(
          (f) => f.property !== "similarity",
        ),
      );
      setSortBeforeSimilar(null);
    }
  }

  // Full recording: a listen-only view that takes over the feed area (the feed
  // stays mounted underneath, so its scroll position and selection survive).
  // Workspace deliberately does NOT listen to the selected snippet: that would
  // re-render the whole hub (projection chart included) on every scroll step.
  // The overlay itself watches the selection while it is open.
  const [fullRecording, setFullRecording] = useState<{
    recordingId: number;
    snippetId: number;
    similarTo: number | null;
  } | null>(null);
  // Also closes when a "Find similar" search starts or ends, so its results
  // are never hidden behind this view. Same "adjust state during render"
  // pattern as above.
  if (fullRecording && similarTo !== fullRecording.similarTo) {
    setFullRecording(null);
  }
  const openFullRecording = useCallback(
    (recordingId: number, snippetId: number) => {
      // One thing playing at a time.
      document.querySelectorAll("audio").forEach((a) => a.pause());
      setFullRecording({ recordingId, snippetId, similarTo });
    },
    [similarTo],
  );
  const closeFullRecording = useCallback(() => setFullRecording(null), []);
  // Written by the snippet header; read by the split while it is dragged.
  const feedMinWidthRef = useRef(0);

  // While it is open: Esc closes it, and the feed's ↑/↓ and Shift+F (Find
  // similar) shortcuts are held back: neither applies to a full recording and
  // ↑/↓ would change the snippet underneath. Capture phase on window runs
  // before those (bubble-phase) handlers, which stay untouched.
  const fullRecordingOpen = fullRecording !== null;
  useEffect(() => {
    if (!fullRecordingOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="textbox"], .ant-popover',
          ))
      ) {
        return;
      }
      if (e.key === "Escape") {
        setFullRecording(null);
        return;
      }
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        (e.shiftKey && e.key.toLowerCase() === "f")
      ) {
        // Immediate: also holds back listeners registered on window itself.
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [fullRecordingOpen]);

  const handleLegendSpeciesToggle = useCallback(
    (label: string) => {
      if (!onFocusSpeciesChange) return;
      onFocusSpeciesChange(
        focusSpecies.includes(label)
          ? focusSpecies.filter((s) => s !== label)
          : [...focusSpecies, label],
        "projection_legend",
      );
    },
    [focusSpecies, onFocusSpeciesChange],
  );

  const focusChipLabel =
    focusSpecies.length === 1
      ? focusSpecies[0]
      : `${focusSpecies.length} species`;

  const rightPanel = (
    <div
      data-tour="feed"
      className="h-full flex flex-col overflow-hidden bg-[#f7fafc]"
    >
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-white">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 leading-none">
            Feed
          </h2>
          {focusSpecies.length > 0 && (
            <Tooltip title={focusSpecies.join(", ")}>
              <Tag
                color="blue"
                closable={!!onFocusSpeciesChange}
                onClose={(e) => {
                  e.preventDefault();
                  onFocusSpeciesChange?.([], "feed_chip");
                }}
                className="m-0 max-w-[260px] truncate text-xs"
              >
                Showing likely: {focusChipLabel}
              </Tag>
            </Tooltip>
          )}
          {similarityActive && !fullRecordingOpen && (
            <Tooltip title="Showing the 500 snippets that sound most like this one. Your filters still apply.">
              <Tag
                color="purple"
                icon={<AudioOutlined />}
                closable={!!onClearSimilar}
                onClose={(e) => {
                  e.preventDefault();
                  onClearSimilar?.("feed_chip");
                }}
                className="m-0 text-xs"
              >
                Similar to #{similarTo}
              </Tag>
            </Tooltip>
          )}
          {fullRecording && (
            <Tag
              color="blue"
              variant="solid"
              icon={<ExpandAltOutlined />}
              closable
              onClose={(e) => {
                e.preventDefault();
                closeFullRecording();
              }}
              className="m-0 text-xs [&_.ant-tag-close-icon]:text-white! [&_.ant-tag-close-icon]:hover:opacity-75"
            >
              Full recording
            </Tag>
          )}
        </div>
        {showFeedAction && (
          <Button
            type="primary"
            size="small"
            loading={feedActionLoading}
            disabled={feedActionDisabled}
            onClick={onFeedAction}
          >
            {feedActionLabel}
          </Button>
        )}
      </div>
      {/* Sorting applies to the feed, not to a full recording: lock it while that is open. */}
      <div
        className={fullRecordingOpen ? "opacity-50 select-none" : undefined}
        {...(fullRecordingOpen
          ? ({ inert: "" } as Record<string, string>)
          : {})}
      >
        <SortPanel
          fields={sortFields}
          onChange={setSortFields}
          allowNonModel={phase.sort.nonModel}
          allowModel={phase.sort.model}
          disabled={phase.sort.disabled}
          similarityActive={similarityActive}
        />
      </div>
      <SnippetHeader
        onFindSimilar={onFindSimilar}
        onOpenFullRecording={openFullRecording}
        onCloseFullRecording={closeFullRecording}
        fullRecordingOpen={fullRecordingOpen}
        minWidthRef={feedMinWidthRef}
      />
      <div className="flex-1 overflow-hidden">
        <PredictionFeed
          onFindSimilar={onFindSimilar}
          hideCardHeader
          sortFields={sortFields}
          exploreFilters={exploreFilters}
          quickLabels={quickLabels}
          quickLabelsLoading={quickLabelsLoading}
          labelsLocked={fullRecordingOpen}
          overlay={
            fullRecording ? (
              <FullRecordingOverlay
                recordingId={fullRecording.recordingId}
                snippetId={fullRecording.snippetId}
                onClose={closeFullRecording}
              />
            ) : undefined
          }
        />
      </div>
    </div>
  );

  const fpvVisible = phase.visualization.mode !== "hidden";
  if (!fpvVisible) {
    return rightPanel;
  }

  return (
    <ResizableSplit
      mode="right_px"
      initialRightRatio={0.45}
      minRightPanelPx={400}
      // The header reports the narrowest width it fits in (it depends on the
      // snippet, e.g. whether "Labeled" shows), so the feed stops exactly there.
      minRightPanelPxRef={feedMinWidthRef}
      maxRightPanelPx={4000}
      maxRightRatio={0.55}
      left={
        <div
          data-tour="projection-panel"
          className="flex flex-col h-full border-r border-gray-200 overflow-hidden"
        >
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white">
            <Tooltip
              title={
                phase.visualization.allowPointClick
                  ? "Click a point to inspect that snippet"
                  : "Projection view (view only)"
              }
            >
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 leading-none cursor-default">
                Feature Projection
              </h2>
            </Tooltip>
          </div>

          <div
            data-tour="projection-methods"
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-white overflow-x-auto"
          >
            {PROJECTION_METHODS.filter(
              (m) => !thumbData?.unavailableMethods.has(m.key),
            ).map((m) => {
              const isActive = m.key === effectiveProjMethod;
              const hasProj = Boolean(
                thumbData?.fpvCoordsBySnippetForMethod?.[m.key],
              );
              const isLoadingThumb =
                Boolean(thumbData?.loadingMethods.has(m.key)) && !hasProj;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleMethodChange(m.key)}
                  disabled={thumbData?.fpvLoading && isActive}
                  className={[
                    "shrink-0 text-left rounded-lg border px-1.5 py-1.5 transition-all",
                    isActive
                      ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                      : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300",
                    !hasProj && !isLoadingThumb
                      ? "opacity-50 cursor-not-allowed"
                      : "",
                  ].join(" ")}
                >
                  <div className="w-18 h-9 rounded-md bg-linear-to-br from-gray-50 to-gray-100 border border-gray-200 overflow-hidden relative">
                    <MiniProjection
                      points={thumbData?.thumbnailPoints ?? []}
                      coordsBySnippet={
                        thumbData?.fpvCoordsBySnippetForMethod?.[m.key] ?? null
                      }
                      selectedSnippetId={thumbData?.selectedSnippetId ?? null}
                      selectedCoord={
                        thumbData?.selectedCoordByMethod?.[m.key] ?? null
                      }
                      allActualLabels={thumbData?.allActualLabels ?? []}
                      loading={isLoadingThumb}
                    />
                  </div>
                  <div
                    className={[
                      "mt-1 text-center text-fs-11 font-ibm-sans",
                      isActive
                        ? "text-blue-700 font-semibold"
                        : "text-gray-600",
                    ].join(" ")}
                  >
                    {m.label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-hidden">
            <ProjectionView
              projectionMethod={effectiveProjMethod}
              onProjectionMethodChange={setProjMethod}
              onThumbnailData={handleThumbnailData}
              exploreFilters={exploreFilters}
              focusSpecies={focusSpecies}
              focusableSpecies={focusableSpecies}
              onLegendSpeciesToggle={
                onFocusSpeciesChange ? handleLegendSpeciesToggle : undefined
              }
            />
          </div>
        </div>
      }
      right={rightPanel}
    />
  );
};

Workspace.displayName = "Workspace";
