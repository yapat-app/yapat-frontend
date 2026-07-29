import { useCallback, useEffect, useState } from "react";
import { Button, Spin, message } from "antd";
import {
  CheckCircleOutlined,
  ExperimentOutlined,
  LockOutlined,
  LoadingOutlined,
  PlusOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../hooks";
import { wssedApi, type WssedTrainingJobSummary } from "../services/api";
import { hasWssedModelPath } from "../utils/wssedModel";

interface WssedActiveLearningHubProps {
  modelTrained: boolean;
  modelTraining: boolean;
  datasetId: number | null;
  onTrainNew?: () => void;
}

/**
 * A job is offerable as a model when it exposes a checkpoint path, regardless
 * of its status string (same rule as hasWssedModelPath elsewhere). A job still
 * TRAINING is excluded: its path is not ready yet.
 */
const isUsableModel = (job: WssedTrainingJobSummary): boolean =>
  job.status !== "TRAINING" && hasWssedModelPath(job);

/** Pull the most representative score out of a job's metrics blob, if present. */
const formatScore = (metrics: Record<string, unknown> | null): string | null => {
  if (!metrics) return null;
  const key = Object.keys(metrics).find(
    (k) => k.toLowerCase().includes("f1") && typeof metrics[k] === "number",
  );
  return key ? `F1 ${(metrics[key] as number).toFixed(3)}` : null;
};

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const WssedActiveLearningHub = ({
  modelTrained,
  modelTraining,
  datasetId,
  onTrainNew,
}: WssedActiveLearningHubProps) => {
  const navigate = useNavigate();
  const { datasetDirectories } = useAppSelector((state) => state.dataset);

  const [jobs, setJobs] = useState<WssedTrainingJobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [activating, setActivating] = useState(false);

  const selectedSpecies =
    datasetDirectories?.species?.[0]?.name ??
    datasetDirectories?.dataset_name ??
    "Dataset";

  const usableJobs = jobs.filter(isUsableModel);
  const selectedJob = usableJobs.find((j) => j.job_id === selectedJobId) ?? null;

  const loadJobs = useCallback(async () => {
    if (!datasetId) {
      setJobs([]);
      setSelectedJobId(null);
      return;
    }
    setJobsLoading(true);
    try {
      const rows = await wssedApi.listTrainingJobs(datasetId);
      setJobs(rows);
      // Default the selection to whatever Active Learning is already using,
      // falling back to the newest usable model.
      const usable = rows.filter(isUsableModel);
      setSelectedJobId((prev) => {
        if (prev != null && usable.some((r) => r.job_id === prev)) return prev;
        return (usable.find((r) => r.is_active) ?? usable[0])?.job_id ?? null;
      });
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs, modelTrained, modelTraining]);

  const goToActiveLearning = (family: string) => {
    navigate(
      datasetId != null
        ? `/active-learning?dataset_id=${datasetId}&model_family=${encodeURIComponent(family)}`
        : "/active-learning",
    );
  };

  /**
   * Registration happens automatically when a job completes, so most jobs
   * arrive here already registered.
   *   - already the family's active checkpoint -> straight navigate.
   *   - registered before but superseded (al_checkpoint_id set, not active)
   *     -> just flip which checkpoint is active. No GPU/file access needed,
   *        so this keeps working even after a later job overwrites the GPU
   *        server's shared output directory for this dataset.
   *   - never registered (auto-registration failed at completion time)
   *     -> fall back to full registration.
   */
  const handleContinue = async () => {
    if (!selectedJob) return;

    if (selectedJob.is_active && selectedJob.al_model_family_name) {
      goToActiveLearning(selectedJob.al_model_family_name);
      return;
    }

    setActivating(true);
    try {
      if (selectedJob.al_checkpoint_id != null) {
        const result = await wssedApi.activateCheckpoint(
          selectedJob.al_checkpoint_id,
        );
        await loadJobs();
        goToActiveLearning(result.model_family_name);
      } else {
        const result = await wssedApi.registerTrainingJobForAL(
          selectedJob.job_id,
        );
        await loadJobs();
        goToActiveLearning(result.model_family_name);
      }
    } catch (err: unknown) {
      message.error(
        err instanceof Error
          ? err.message
          : "Could not prepare this model for Active Learning",
      );
    } finally {
      setActivating(false);
    }
  };

  const chooseStepDone = selectedJob != null;

  const renderStep = (
    label: string,
    done: boolean,
    active: boolean,
    stepNumber: number,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? "bg-emerald-100 text-emerald-700"
            : active
              ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
              : "bg-slate-100 text-slate-400"
        }`}
      >
        {done ? <CheckCircleOutlined /> : stepNumber}
      </div>
      <span
        className={`text-[11px] font-medium leading-tight ${
          done || active ? "text-slate-800" : "text-slate-400"
        }`}
      >
        {label}
      </span>
    </div>
  );

  const renderJobRow = (job: WssedTrainingJobSummary) => {
    const isSelected = job.job_id === selectedJobId;
    const score = formatScore(job.metrics);
    const epochs = job.current_epoch ?? job.total_epochs;
    const date = formatDate(job.completed_at ?? job.created_at);
    const meta = [
      epochs != null ? `${epochs} ep` : null,
      date,
      job.status !== "COMPLETED" ? job.status.toLowerCase() : null,
      job.is_active ? "in use" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <button
        key={job.job_id}
        type="button"
        onClick={() => setSelectedJobId(job.job_id)}
        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
          isSelected
            ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-200"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
            <CheckCircleOutlined
              className={isSelected ? "text-blue-600" : "text-transparent"}
            />
            #{job.job_id} · {job.model_name ?? "model"}
            {score ? ` · ${score}` : ""}
          </span>
          {job.is_active && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              ACTIVE
            </span>
          )}
        </div>
        {meta && <div className="mt-0.5 text-[11px] text-slate-500">{meta}</div>}
      </button>
    );
  };

  const renderContent = () => {
    if (!datasetId) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <LockOutlined className="text-3xl text-slate-300" />
          <div>
            <h4 className="text-base font-semibold text-slate-800">
              Select a dataset
            </h4>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Choose a dataset from the explorer on the left to pick a trained
              model or start a new training run.
            </p>
          </div>
        </div>
      );
    }

    if (modelTraining) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <Spin indicator={<LoadingOutlined spin />} size="large" />
          <div>
            <h4 className="text-base font-semibold text-slate-800">
              Training in progress
            </h4>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Your WSSED model is training on the GPU server. Progress is shown
              in the panel on the right. It will appear in this list and be
              registered for Active Learning automatically when it finishes.
            </p>
          </div>
        </div>
      );
    }

    if (jobsLoading && jobs.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <Spin indicator={<LoadingOutlined spin />} size="large" />
          <p className="text-sm text-slate-500">Loading trained models…</p>
        </div>
      );
    }

    if (usableJobs.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <ExperimentOutlined className="text-3xl text-slate-300" />
          <div>
            <h4 className="text-base font-semibold text-slate-800">
              No trained models yet
            </h4>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Configure and start WSSED training in the panel on the right. When
              it completes, the model lands here and is registered for Active
              Learning automatically.
            </p>
          </div>
          {onTrainNew && (
            <Button icon={<PlusOutlined />} onClick={onTrainNew}>
              Train a model
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Available models
          </span>
          <span className="text-[11px] text-slate-400">
            {usableJobs.length} {usableJobs.length === 1 ? "model" : "models"}
          </span>
        </div>

        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-0.5">
          {usableJobs.map(renderJobRow)}
        </div>

        {selectedJob?.metrics?.al_registration_error != null && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
            Automatic registration failed for this model. Continuing will retry
            it: {String(selectedJob.metrics.al_registration_error)}
          </p>
        )}

        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          disabled={!selectedJob}
          loading={activating}
          onClick={() => void handleContinue()}
        >
          Continue to Active Learning
        </Button>

        {onTrainNew && (
          <Button icon={<PlusOutlined />} onClick={onTrainNew}>
            Train a new model
          </Button>
        )}
      </div>
    );
  };

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-slate-100 px-6 py-3">
        <h2 className="text-base font-semibold uppercase tracking-wide text-slate-900">
          {selectedSpecies}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Weakly supervised training → Active Learning review
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-50/50 p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-2">
            {renderStep("Choose model", chooseStepDone, !chooseStepDone, 1)}
            <div
              className={`mt-4 h-0.5 flex-1 ${chooseStepDone ? "bg-emerald-200" : "bg-slate-200"}`}
            />
            {renderStep("Active Learning", false, chooseStepDone, 2)}
          </div>

          {renderContent()}
        </div>
      </div>
    </main>
  );
};
