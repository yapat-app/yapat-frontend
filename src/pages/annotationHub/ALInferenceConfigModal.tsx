import React from "react";
import {
  Modal,
  Form,
  InputNumber,
  Alert,
  Input,
  Switch,
  Select,
} from "antd";
import { useAppDispatch } from "../../hooks";
import { getAllEmbeddingMethods } from "../../redux/features/embeddingSlice";
import type { PAMCheckpoint } from "../../types/al";
import type { SnippetSet, EmbeddingMethod } from "../../types";

const { Option } = Select;

export type ALInferenceConfigModalProps = {
  open: boolean;
  onCancel: () => void;
  onOk: () => void | Promise<void>;
  checkpoints: PAMCheckpoint[];
  snippetSets: SnippetSet[];
  embeddingMethods: EmbeddingMethod[] | null | undefined;
  embeddingMethodsLoading: boolean;
  localCkpt: number | null;
  setLocalCkpt: (v: number | null) => void;
  localFamily: string | null;
  setLocalFamily: (v: string | null) => void;
  localSS: number | null;
  setLocalSS: (v: number | null) => void;
  localK: number;
  setLocalK: (v: number) => void;
  localTopKOnly: boolean;
  setLocalTopKOnly: (v: boolean) => void;
  hasGroundTruthMetadata: boolean;
  setHasGroundTruthMetadata: (v: boolean) => void;
  trainEmbeddingModelId: number;
  setTrainEmbeddingModelId: (v: number) => void;
  trainMetadataPath: string;
  setTrainMetadataPath: (v: string) => void;
  trainLabelConfigPath: string;
  setTrainLabelConfigPath: (v: string) => void;
  trainDevice: "cpu" | "cuda";
  setTrainDevice: (v: "cpu" | "cuda") => void;
  trainRunInference: boolean;
  setTrainRunInference: (v: boolean) => void;
};

export const ALInferenceConfigModal: React.FC<ALInferenceConfigModalProps> = ({
  open,
  onCancel,
  onOk,
  checkpoints,
  snippetSets,
  embeddingMethods,
  embeddingMethodsLoading,
  localCkpt,
  setLocalCkpt,
  localFamily,
  setLocalFamily,
  localSS,
  setLocalSS,
  localK,
  setLocalK,
  localTopKOnly,
  setLocalTopKOnly,
  hasGroundTruthMetadata,
  setHasGroundTruthMetadata,
  trainEmbeddingModelId,
  setTrainEmbeddingModelId,
  trainMetadataPath,
  setTrainMetadataPath,
  trainLabelConfigPath,
  setTrainLabelConfigPath,
  trainDevice,
  setTrainDevice,
  trainRunInference,
  setTrainRunInference,
}) => {
  const dispatch = useAppDispatch();

  const okText =
    checkpoints.length > 0
      ? "Resume"
      : hasGroundTruthMetadata
        ? "Start training"
        : "Start annotating";

  const okDisabled =
    !localSS ||
    (checkpoints.length === 0
      ? !(localFamily && localFamily.trim().length > 0) ||
        (hasGroundTruthMetadata &&
          (!Number.isFinite(trainEmbeddingModelId) ||
            !trainMetadataPath.trim() ||
            !trainLabelConfigPath.trim()))
      : !localCkpt);

  return (
    <Modal
      title={checkpoints.length > 0 ? "Resume labeling" : "Start labeling"}
      open={open}
      onCancel={onCancel}
      onOk={() => void onOk()}
      okText={okText}
      okButtonProps={{
        disabled: okDisabled,
        style: { backgroundColor: "#1e40af", color: "#fff" },
      }}
    >
      <Form layout="vertical" className="mt-4">
        {checkpoints.length > 0 ? (
          <Form.Item label="Model Checkpoint" required>
            <Select
              placeholder="Select checkpoint"
              value={localCkpt ?? undefined}
              onChange={(id: number) => {
                setLocalCkpt(id);
                const fam =
                  checkpoints.find((c) => c.id === id)?.model_family_name ?? null;
                setLocalFamily(fam);
              }}
              style={{ width: "100%" }}
            >
              {checkpoints.map((c) => (
                <Option key={c.id} value={c.id}>
                  {c.model_family_name} — {c.version}{" "}
                  {c.is_base ? "(base)" : ""}
                </Option>
              ))}
            </Select>
          </Form.Item>
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message="No model checkpoint found yet"
              description="Cold-start from ground-truth metadata or bootstrap with random samples."
              className="mb-3"
            />
            <Form.Item label="Model family name" required>
              <Input
                placeholder="e.g. birdnet, yamnet, default"
                value={localFamily ?? ""}
                onChange={(e) => setLocalFamily(e.target.value)}
              />
            </Form.Item>
            <Form.Item label="Do you have ground-truth metadata?">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">
                  Train from metadata (cold start)
                </div>
                <Switch
                  checked={hasGroundTruthMetadata}
                  onChange={(v) => {
                    setHasGroundTruthMetadata(v);
                    if (v) dispatch(getAllEmbeddingMethods());
                  }}
                />
              </div>
              <div className="text-xs text-gray-400 mt-1">
                If disabled, the session starts in bootstrap mode (random samples).
              </div>
            </Form.Item>
            {hasGroundTruthMetadata && (
              <>
                <Form.Item label="Embedding model" required>
                  <Select
                    placeholder={
                      embeddingMethodsLoading ? "Loading…" : "Select embedding model"
                    }
                    loading={embeddingMethodsLoading}
                    value={trainEmbeddingModelId}
                    onChange={(v: number) => setTrainEmbeddingModelId(v)}
                    style={{ width: "100%" }}
                    showSearch
                    optionFilterProp="children"
                  >
                    {(embeddingMethods ?? []).map((m) => (
                      <Option key={m.id} value={m.id}>
                        {m.name} — {m.version}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item label="Metadata path (ground truth)" required>
                  <Input
                    placeholder='e.g. "pam/FNJV/metadata.csv"'
                    value={trainMetadataPath}
                    onChange={(e) => setTrainMetadataPath(e.target.value)}
                  />
                </Form.Item>
                <Form.Item label="Label config path" required>
                  <Input
                    placeholder='e.g. "pam/FNJV/labels.json"'
                    value={trainLabelConfigPath}
                    onChange={(e) => setTrainLabelConfigPath(e.target.value)}
                  />
                </Form.Item>
                <Form.Item label="Device">
                  <Select
                    value={trainDevice}
                    onChange={(v) => setTrainDevice(v)}
                    style={{ width: "100%" }}
                  >
                    <Option value="cpu">cpu</Option>
                    <Option value="cuda">cuda</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Run inference automatically after training">
                  <Switch
                    checked={trainRunInference}
                    onChange={setTrainRunInference}
                  />
                </Form.Item>
              </>
            )}
          </>
        )}
        <Form.Item label="Snippet Set" required>
          <Select
            placeholder="Select snippet set"
            value={localSS ?? undefined}
            onChange={setLocalSS}
            style={{ width: "100%" }}
          >
            {snippetSets.map((s) => (
              <Option key={s.id} value={s.id}>
                Set #{s.id} — {s.status}
              </Option>
            ))}
          </Select>
          {snippetSets.length === 0 && (
            <p className="text-xs text-amber-500 mt-1">
              No snippet sets found. Generate embeddings first.
            </p>
          )}
        </Form.Item>
        <Form.Item label="Top-K predictions">
          <InputNumber
            min={1}
            max={500}
            value={localK}
            onChange={(v) => setLocalK(v ?? 20)}
            style={{ width: "100%" }}
            disabled={
              !localTopKOnly || (checkpoints.length === 0 && hasGroundTruthMetadata)
            }
          />
        </Form.Item>
        <Form.Item label="Mode">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-600">Return only Top‑K suggestions</div>
            <Switch
              checked={localTopKOnly}
              onChange={setLocalTopKOnly}
              disabled={checkpoints.length === 0 && hasGroundTruthMetadata}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">
            When disabled, returns all predictions for the selected snippet set.
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

ALInferenceConfigModal.displayName = "ALInferenceConfigModal";
