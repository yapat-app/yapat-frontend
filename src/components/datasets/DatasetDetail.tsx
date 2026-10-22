/**
 * DatasetDetail — the right panel of the Datasets page for one dataset.
 *
 * Replaces the old per-dataset card layout; the behaviour is the card's:
 * same actions, handlers, API calls, modals and role rules. The page mounts
 * this with `key={dataset.id}` so local state (quick labels, open modals)
 * always belongs to the selected dataset.
 *
 * Custom clickable surfaces are div[role=button], not <button>: a global
 * `button { all: unset }` rule from a dependency strips <button> styling.
 */

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, Tooltip } from "antd";
import {
  CheckSquareOutlined,
  InfoCircleOutlined,
  RightOutlined,
  ScissorOutlined,
  SettingOutlined,
  SoundOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { Dataset, QuickLabel } from "../../types";
import { useAppSelector } from "../../hooks";
import { usePhaseConfig } from "../../studyPhases";
import { datasetApi } from "../../services/api";
import { GenerateEmbeddings } from "../GenerateEmbeddings";
import { EmbeddingProgressPanel } from "../EmbeddingProgressPanel";
import { ScanProgressPanel } from "../ScanProgressPanel";
import { DatasetSpectrogramSettings } from "../DatasetSpectrogramSettings";
import { DatasetReferencePools } from "../DatasetReferencePools";
import { DatasetQuickLabelsModal } from "../DatasetQuickLabelsModal";
import { DatasetMetadataModal } from "../DatasetMetadataModal";
import { ExportAnnotationPanel } from "../ExportAnnotation";
import { useDatasetJobs } from "./datasetJobsContext";
import { TILE_HEADER_CLASS, TileActionButton } from "./TileActionButton";
import {
  DATASET_STATUS_META,
  formatPercent,
  getDatasetStatus,
} from "../../utils/datasetStatus";

type Props = {
  dataset: Dataset;
};

/** Keyboard activation for div[role=button] surfaces. */
const activateOnKey =
  (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

/**
 * Section heading. An optional `hint` is not printed on the page: it sits
 * behind a small info icon and shows in the app's standard Tooltip (the same
 * dark bubble as every other hover hint), on hover, click or keyboard.
 */
const SectionLabel = ({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) => (
  <div className="mb-3 flex items-center gap-1.5">
    <h3 className="m-0 text-fs-11 font-semibold uppercase tracking-wider text-slate-500 font-ibm-sans">
      {children}
    </h3>
    {hint && (
      <Tooltip title={hint} trigger={["hover", "click"]}>
        <span
          role="button"
          tabIndex={0}
          aria-label="More information"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
          className="inline-flex cursor-pointer text-sm text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <InfoCircleOutlined />
        </span>
      </Tooltip>
    )}
  </div>
);

const TileLabel = ({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) => (
  <p className="m-0 flex items-center gap-2 whitespace-nowrap text-fs-11 font-semibold uppercase tracking-wider text-slate-600 font-ibm-sans">
    <span className="text-slate-500">{icon}</span>
    {children}
  </p>
);

/** Centered stat tile: small icon + label above a large number. */
const StatTile = ({
  icon,
  label,
  valueClass = "text-slate-800",
  children,
  footer,
}: {
  icon: ReactNode;
  label: string;
  valueClass?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <div className="flex h-full flex-col items-center justify-center rounded-lg bg-slate-50 px-3 py-3.5 text-center">
    <p className="m-0 flex items-center justify-center gap-1.5 text-xs text-slate-600">
      {icon}
      {label}
    </p>
    <div
      className={`mt-1 min-h-8 whitespace-nowrap text-2xl font-semibold leading-8 font-ibm-mono ${valueClass}`}
    >
      {children}
    </div>
    {footer}
  </div>
);

/**
 * Columns follow the panel's own width (container queries), not the screen:
 * the panel's width depends on the list beside it. With an odd number of tiles
 * in two columns the last one spans the row.
 */
const SETUP_COLS: Record<number, string> = {
  1: "",
  2: "@xl:grid-cols-2",
  3: "@xl:grid-cols-2 @xl:[&>:last-child:nth-child(odd)]:col-span-2 @4xl:grid-cols-3 @4xl:[&>:last-child:nth-child(odd)]:col-span-1",
};

export const DatasetDetail: React.FC<Props> = ({ dataset }) => {
  const { datasetAnnotations } = useAppSelector((state) => state.annotation);
  const navigate = useNavigate();
  const phase = usePhaseConfig();
  const { user } = useAppSelector((state) => state.auth);
  const isAdmin = user?.role === "admin";
  // Reference pools are training data only: no annotation entry points.
  const isReference = !!dataset.is_reference;

  const jobs = useDatasetJobs(dataset);
  const status = getDatasetStatus(dataset, jobs);
  const statusMeta = DATASET_STATUS_META[status];

  const [quickLabels, setQuickLabels] = useState<QuickLabel[]>([]);
  const [managingLabels, setManagingLabels] = useState(false);
  const [managingMetadata, setManagingMetadata] = useState(false);

  useEffect(() => {
    datasetApi
      .getQuickLabels(Number(dataset.id))
      .then(setQuickLabels)
      .catch(() => setQuickLabels([]));
  }, [dataset.id]);

  const handleStartAL = () => {
    navigate(`/annotate?dataset_id=${dataset.id}&phase=${phase.id}`);
  };

  const openFiles = () => navigate(`/datasets/${dataset.id}/files`);

  const datasetTypeLabel = (dataset.dataset_type ?? "PAM").replaceAll("_", " ");

  const stats = datasetAnnotations?.datasets?.find(
    (d) => Number(d.dataset_id) === Number(dataset.id),
  );
  const statsReady = stats != null;

  const statPlaceholder = (
    <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-200 align-middle" />
  );

  const annotatedPct =
    statsReady && stats.total_snippets > 0
      ? Math.min(100, (stats.annotated_snippets / stats.total_snippets) * 100)
      : 0;

  // Non-admins cannot generate embeddings; admins get the button instead.
  const missingEmbeddingsNote =
    "Please ask Admin / Team owner to generate embeddings for the dataset.";
  const statusTooltip =
    status === "not_found" && !isAdmin ? missingEmbeddingsNote : statusMeta.hint;

  const canManage = isAdmin || user?.role === "team_owner";
  const setupHint = canManage
    ? "Settings used when annotating this dataset."
    : "Settings used when annotating this dataset. Only admins and team owners can change the spectrogram range.";

  const setupTileCount =
    1 + (!isReference ? 1 : 0) + (!isReference && isAdmin ? 1 : 0);

  const chips = quickLabels.slice(0, 5);

  return (
    <div className="@container overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-72">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h2 className="m-0 min-w-0 break-all text-2xl font-bold font-ibm-mono text-slate-900">
                {dataset.name}
              </h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {datasetTypeLabel}
              </span>
              {isReference && (
                <Tooltip title="Reference pool: labelled training data for linked datasets. Not annotated directly.">
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    Reference
                  </span>
                </Tooltip>
              )}
              {/* Status pill, tinted by state; the dot matches the list and legend. */}
              <Tooltip title={statusTooltip}>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusMeta.badge}`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusMeta.dot}`}
                  />
                  {statusMeta.label}
                </span>
              </Tooltip>
            </div>
            <p className="m-0 mt-1 text-sm text-slate-500 font-ibm-sans">
              {dataset.description?.trim() ? dataset.description : "—"}
            </p>
            {!isAdmin && status === "not_found" && (
              <p className="m-0 mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                <InfoCircleOutlined />
                {missingEmbeddingsNote}
              </p>
            )}
            {isReference && (
              <p className="m-0 mt-2 text-xs text-gray-500">
                Label file:{" "}
                <code className="text-gray-700">
                  {dataset.reference_metadata_path ||
                    `${dataset.source_uri}/pam_metadata.csv`}
                </code>
              </p>
            )}
          </div>

          {(!isReference || (isAdmin && status === "not_found")) && (
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2.5 sm:w-auto">
              {/* Generate Embeddings (admin only): only offered while the
                  embeddings are missing; once they are ready it is gone. */}
              {isAdmin && status === "not_found" && (
                <GenerateEmbeddings
                  dataset={dataset}
                  running={jobs.running}
                  onStarted={jobs.setStartedJobId}
                  scanning={jobs.scanning}
                  scanFailed={jobs.scanFailed}
                  size="large"
                />
              )}
              {/* Classic "Generate Feed" (GenerateFeedModal) stays hidden. */}
              {!isReference && (
                <Button
                  icon={<ThunderboltOutlined />}
                  type="primary"
                  size="large"
                  style={{
                    backgroundColor: "#1e40af",
                    borderColor: "#1e40af",
                    color: "#fff",
                  }}
                  onClick={handleStartAL}
                  title="Start PAM Active Learning"
                >
                  Active Learning
                </Button>
              )}
            </div>
          )}
        </div>

        {jobs.activeScan != null && (
          <div className="mt-4">
            <ScanProgressPanel
              progress={jobs.scanProgress}
              etaSeconds={jobs.scanEtaSeconds}
              isRescan={(dataset.recording_count ?? 0) > 0}
            />
          </div>
        )}

        {jobs.activeJobId != null && (
          <div className="mt-4">
            <EmbeddingProgressPanel
              progress={jobs.embeddingProgress}
              etaSeconds={jobs.etaSeconds}
              recordingCount={dataset.recording_count}
            />
          </div>
        )}

        {/* Stats */}
        <div className="mt-5 grid grid-cols-1 gap-3 @lg:grid-cols-2 @lg:[&>:last-child:nth-child(odd)]:col-span-2 @3xl:grid-cols-3 @3xl:[&>:last-child:nth-child(odd)]:col-span-1">
          <Tooltip title="Tap to view files">
            <div
              role="link"
              tabIndex={0}
              aria-label={`View audio files of ${dataset.name}`}
              onClick={openFiles}
              onKeyDown={activateOnKey(openFiles)}
              className="cursor-pointer rounded-lg transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <StatTile icon={<SoundOutlined />} label="Audio files">
                {dataset.recording_count?.toLocaleString()}
              </StatTile>
            </div>
          </Tooltip>
          <StatTile icon={<ScissorOutlined />} label="Total snippets">
            {statsReady ? stats.total_snippets.toLocaleString() : statPlaceholder}
          </StatTile>
          <StatTile
            icon={<CheckSquareOutlined />}
            label="Annotated snippets"
            valueClass="text-emerald-700"
            footer={
              statsReady ? (
                <div
                  className="mt-1 h-1 w-3/5 overflow-hidden rounded-full bg-slate-200"
                  title={formatPercent(stats.annotated_snippets, stats.total_snippets)}
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{
                      width: `${annotatedPct > 0 ? Math.max(annotatedPct, 1.5) : 0}%`,
                    }}
                  />
                </div>
              ) : undefined
            }
          >
            {statsReady
              ? `${stats.annotated_snippets.toLocaleString()} / ${stats.total_snippets.toLocaleString()}`
              : statPlaceholder}
          </StatTile>
        </div>
      </div>

      {/* Annotation setup */}
      <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
        <SectionLabel hint={isReference ? undefined : setupHint}>
          {isReference ? "Setup" : "Annotation setup"}
        </SectionLabel>
        <div
          className={`grid grid-cols-1 items-stretch gap-3 ${SETUP_COLS[setupTileCount]}`}
        >
          <DatasetSpectrogramSettings dataset={dataset} />

          {!isReference && (
            <div className="h-full rounded-lg border border-slate-200 bg-white px-4 py-3.5">
              <div className={TILE_HEADER_CLASS}>
                <div className="flex items-center gap-2">
                  <TileLabel icon={<ThunderboltOutlined />}>Quick labels</TileLabel>
                  {quickLabels.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-px text-fs-10 font-semibold text-slate-600">
                      {quickLabels.length}
                    </span>
                  )}
                </div>
                <TileActionButton
                  icon={<SettingOutlined />}
                  onClick={() => setManagingLabels(true)}
                >
                  Manage
                </TileActionButton>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {chips.map((l) => (
                  <span
                    key={l.taxon_id}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-fs-11 font-medium leading-none text-slate-700"
                  >
                    {l.display_name}
                  </span>
                ))}
                {quickLabels.length > 5 && (
                  <Tooltip
                    title={quickLabels
                      .slice(5)
                      .map((l) => l.display_name)
                      .join(", ")}
                  >
                    <span className="inline-flex cursor-default items-center rounded-md bg-blue-50 px-2 py-1 text-fs-11 font-medium leading-none text-blue-600">
                      +{quickLabels.length - 5} more
                    </span>
                  </Tooltip>
                )}
                {quickLabels.length === 0 && (
                  <span className="text-xs text-slate-400">
                    No quick labels yet
                  </span>
                )}
              </div>
            </div>
          )}

          {!isReference && isAdmin && <DatasetReferencePools dataset={dataset} />}
        </div>
      </div>

      {/* Data & tools */}
      {!isReference && (
        <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
          <SectionLabel>Data &amp; tools</SectionLabel>
          <div className="grid grid-cols-1 items-start gap-3 @2xl:grid-cols-2">
            <ExportAnnotationPanel
              datasetId={dataset.id}
              disabled={!statsReady || stats.annotated_snippets < 1}
              annotated={statsReady ? stats.annotated_snippets : null}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => setManagingMetadata(true)}
              onKeyDown={activateOnKey(() => setManagingMetadata(true))}
              title="Download the metadata template or upload metadata for this dataset's recordings"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3.5 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <TableOutlined />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold text-slate-900 font-ibm-sans">
                  Metadata
                </p>
                <p className="m-0 text-xs text-slate-500 font-ibm-sans">
                  Per-file details for{" "}
                  {(dataset.recording_count ?? 0).toLocaleString()} recordings
                </p>
              </div>
              <RightOutlined className="text-slate-400" />
            </div>
          </div>
        </div>
      )}

      <DatasetQuickLabelsModal
        dataset={dataset}
        open={managingLabels}
        onClose={() => setManagingLabels(false)}
        onSaved={(saved) => setQuickLabels(saved)}
      />

      <DatasetMetadataModal
        dataset={dataset}
        open={managingMetadata}
        onClose={() => setManagingMetadata(false)}
      />
    </div>
  );
};
