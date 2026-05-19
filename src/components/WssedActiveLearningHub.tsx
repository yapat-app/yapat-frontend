import { useEffect, useState } from "react";
import { Button, Spin, message } from "antd";
import {
  CheckCircleOutlined,
  ExperimentOutlined,
  LockOutlined,
  LoadingOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../hooks";
import { wssedApi } from "../services/api";

interface WssedActiveLearningHubProps {
  modelTrained: boolean;
  modelTraining: boolean;
  datasetId: number | null;
}

type CompletedJob = {
  job_id: number;
  model_path: string | null;
};

type AlRegistration = {
  al_checkpoint_id: number;
  model_family_name: string;
};

export const WssedActiveLearningHub = ({
  modelTrained,
  modelTraining,
  datasetId,
}: WssedActiveLearningHubProps) => {
  const navigate = useNavigate();
  const { datasetDirectories } = useAppSelector((state) => state.dataset);

  const [jobLoading, setJobLoading] = useState(false);
  const [lastJob, setLastJob] = useState<CompletedJob | null>(null);
  const [alRegistration, setAlRegistration] = useState<AlRegistration | null>(
    null,
  );
  const [registeringAl, setRegisteringAl] = useState(false);

  const selectedSpecies =
    datasetDirectories?.species?.[0]?.name ??
    datasetDirectories?.dataset_name ??
    "Dataset";

  const alModelFamily =
    alRegistration?.model_family_name ?? "wssed_birdnet_segment";
  const activeLearningUrl =
    datasetId != null
      ? `/active-learning?dataset_id=${datasetId}&model_family=${encodeURIComponent(alModelFamily)}`
      : "/active-learning";

  useEffect(() => {
    if (!datasetId || !modelTrained) {
      setLastJob(null);
      setAlRegistration(null);
      return;
    }

    let cancelled = false;
    setJobLoading(true);

    (async () => {
      try {
        const status = await wssedApi.getLatestTrainingJobStatus(datasetId);
        if (cancelled) return;

        if (status.status === "COMPLETED") {
          setLastJob({
            job_id: status.job_id,
            model_path: status.model_path,
          });
          const metrics = (status.metrics ?? {}) as Record<string, unknown>;
          const ckptId = metrics.al_checkpoint_id;
          const family = metrics.al_model_family_name;
          if (typeof ckptId === "number" && typeof family === "string") {
            setAlRegistration({
              al_checkpoint_id: ckptId,
              model_family_name: family,
            });
          } else {
            setAlRegistration(null);
          }
        } else {
          setLastJob(null);
          setAlRegistration(null);
        }
      } catch {
        if (!cancelled) {
          setLastJob(null);
          setAlRegistration(null);
        }
      } finally {
        if (!cancelled) {
          setJobLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [datasetId, modelTrained, modelTraining]);

  const handleRegisterForAL = async () => {
    if (!lastJob?.job_id) {
      message.warning("No completed training job to register.");
      return;
    }
    setRegisteringAl(true);
    try {
      const result = await wssedApi.registerTrainingJobForAL(lastJob.job_id);
      setAlRegistration({
        al_checkpoint_id: result.al_checkpoint_id,
        model_family_name: result.model_family_name,
      });
      message.success(
        "Checkpoint registered for Active Learning. Open the flow below to start reviewing snippets.",
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to register checkpoint";
      message.error(msg);
    } finally {
      setRegisteringAl(false);
    }
  };

  const trainingStepDone = modelTrained;
  const registerStepDone = alRegistration != null;
  const readyForAl = trainingStepDone && registerStepDone;

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
              Choose a dataset from the explorer on the left to configure
              training and continue to Active Learning.
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
              in the panel on the right. Active Learning will unlock when
              training finishes.
            </p>
          </div>
        </div>
      );
    }

    if (!modelTrained) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <ExperimentOutlined className="text-3xl text-slate-300" />
          <div>
            <h4 className="text-base font-semibold text-slate-800">
              Train your event detector first
            </h4>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Configure and start WSSED training in the panel on the right. Once
              training completes, you can register the checkpoint and open
              Active Learning to review model suggestions.
            </p>
          </div>
        </div>
      );
    }

    if (jobLoading) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <Spin indicator={<LoadingOutlined spin />} size="large" />
          <p className="text-sm text-slate-500">Loading training status…</p>
        </div>
      );
    }

    if (!lastJob) {
      return (
        <div className="flex flex-col items-center gap-3 text-center">
          <ExperimentOutlined className="text-3xl text-slate-300" />
          <div>
            <h4 className="text-base font-semibold text-slate-800">
              No completed training job found
            </h4>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Start or wait for a training job to finish in the panel on the
              right, then return here to continue.
            </p>
          </div>
        </div>
      );
    }

    if (readyForAl) {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-emerald-50 p-3">
            <CheckCircleOutlined className="text-3xl text-emerald-600" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-slate-900">
              Ready for Active Learning
            </h4>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Checkpoint #{alRegistration.al_checkpoint_id} is registered for
              model family{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {alModelFamily}
              </code>
              . Open Active Learning to choose a snippet set, run inference, and
              review suggestions.
            </p>
            {lastJob.model_path && (
              <p className="mt-3 max-w-lg truncate font-mono text-[11px] text-slate-400">
                {lastJob.model_path}
              </p>
            )}
          </div>
          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            onClick={() => navigate(activeLearningUrl)}
          >
            Open Active Learning
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-amber-50 p-3">
          <RocketOutlined className="text-3xl text-amber-600" />
        </div>
        <div>
          <h4 className="text-lg font-semibold text-slate-900">
            Register for Active Learning
          </h4>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Training job #{lastJob.job_id} completed successfully. Register the
            checkpoint so the Active Learning flow can use this model to
            generate review suggestions for{" "}
            <strong>{selectedSpecies}</strong>.
          </p>
          {lastJob.model_path && (
            <p className="mt-3 max-w-lg truncate font-mono text-[11px] text-slate-400">
              {lastJob.model_path}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="primary"
            size="large"
            loading={registeringAl}
            onClick={() => void handleRegisterForAL()}
          >
            Register for Active Learning
          </Button>
          <Button size="large" onClick={() => navigate(activeLearningUrl)}>
            Open Active Learning
          </Button>
        </div>
        <p className="max-w-md text-xs text-slate-400">
          You can open Active Learning before registering, but inference will
          only work after the checkpoint is registered.
        </p>
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
            {renderStep("Train model", trainingStepDone, !trainingStepDone, 1)}
            <div
              className={`mt-4 h-0.5 flex-1 ${trainingStepDone ? "bg-emerald-200" : "bg-slate-200"}`}
            />
            {renderStep(
              "Register checkpoint",
              registerStepDone,
              trainingStepDone && !registerStepDone,
              2,
            )}
            <div
              className={`mt-4 h-0.5 flex-1 ${registerStepDone ? "bg-emerald-200" : "bg-slate-200"}`}
            />
            {renderStep(
              "Active Learning",
              false,
              registerStepDone,
              3,
            )}
          </div>

          {renderContent()}
        </div>
      </div>
    </main>
  );
};
