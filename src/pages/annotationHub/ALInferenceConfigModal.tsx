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
import type { EmbeddingMethod } from "../../types";

const { Option } = Select;

export type ALInferenceConfigModalProps = {
  open: boolean;
  onCancel: () => void;
  onOk: () => void | Promise<void>;
  checkpoints: PAMCheckpoint[];
  embeddingMethods: EmbeddingMethod[] | null | undefined;
  embeddingMethodsLoading: boolean;
  localCkpt: number | null;
  setLocalCkpt: (v: number | null) => void;
  localFamily: string | null;
  setLocalFamily: (v: string | null) => void;
  localK: number;
  setLocalK: (v: number) => void;
  localTopKOnly: boolean;
  setLocalTopKOnly: (v: boolean) => void;
  hasReadySnippetSet: boolean;
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
  isValidateMode?: boolean;
  localMinConfidence: number | null;
  setLocalMinConfidence: (v: number | null) => void;
  localLabelScope: string[];
  setLocalLabelScope: (v: string[]) => void;
  labelScopeOptions: string[];
  labelScopeLoading?: boolean;
};

export const ALInferenceConfigModal: React.FC<ALInferenceConfigModalProps> = ({
  open,
  onCancel,
  onOk,
  checkpoints,
  embeddingMethods,
  embeddingMethodsLoading,
  localCkpt,
  setLocalCkpt,
  localFamily,
  setLocalFamily,
  localK,
  setLocalK,
  localTopKOnly,
  setLocalTopKOnly,
  hasReadySnippetSet,
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
  isValidateMode = false,
  localMinConfidence,
  setLocalMinConfidence,
  localLabelScope,
  setLocalLabelScope,
  labelScopeOptions,
  labelScopeLoading = false,
}) => {
  const dispatch = useAppDispatch();

  const modalTitle = isValidateMode
    ? checkpoints.length > 0
      ? "Edit Validate Feed"
      : "Generate Validate Feed"
    : checkpoints.length > 0
      ? "Edit Feed"
      : "Generate Feed";
  const okText = "Apply";

  const okDisabled = !hasReadySnippetSet
    ? true
    : checkpoints.length === 0
      ? !(localFamily && localFamily.trim().length > 0) ||
        (hasGroundTruthMetadata &&
          (!Number.isFinite(trainEmbeddingModelId) ||
            !trainMetadataPath.trim() ||
            !trainLabelConfigPath.trim()))
      : !localCkpt;

  return (
    <Modal
      title={modalTitle}
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
            {!hasReadySnippetSet && (
              <Alert
                type="warning"
                showIcon
                className="mb-3"
                message="No READY default snippet set found for this dataset"
                description="Generate snippets/embeddings first. Inference now auto-uses the dataset's default READY snippet set."
              />
            )}
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
                <Form.Item
                  label="Metadata path (ground truth)"
                  required
                  extra="Relative to the data root; defaults to &lt;source_uri&gt;/pam_metadata.csv when present."
                >
                  <Input
                    placeholder='e.g. "test_dataset4/pam_metadata.csv"'
                    value={trainMetadataPath}
                    onChange={(e) => setTrainMetadataPath(e.target.value)}
                  />
                </Form.Item>
                <Form.Item
                  label="Label config path"
                  required
                  extra="Defaults to dataset pam_label_config.json or labels.json."
                >
                  <Input
                    placeholder='e.g. "test_dataset4/pam_label_config.json"'
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
        {isValidateMode && (
          <>
            <Form.Item
              label="Focus on species (optional)"
              tooltip="Rank snippets by how confidently the model detects any of these species. Leave empty to rank by the single highest-probability label on each snippet."
            >
              <Select
                mode="multiple"
                allowClear
                placeholder={
                  labelScopeLoading
                    ? "Loading checkpoint labels…"
                    : "Select species to focus on"
                }
                loading={labelScopeLoading}
                value={localLabelScope}
                onChange={(v) => setLocalLabelScope(v)}
                options={labelScopeOptions.map((name) => ({
                  label: name,
                  value: name,
                }))}
                style={{ width: "100%" }}
                maxTagCount="responsive"
              />
              <div className="text-xs text-gray-400 mt-1">
                Leave empty to rank by the model's top prediction regardless of species.
              </div>
            </Form.Item>
            <Form.Item
              label="Minimum confidence (optional)"
              tooltip="Only show snippets where the model's confidence meets this threshold. Useful to focus on clear predictions and skip uncertain ones."
            >
              <InputNumber
                min={0}
                max={1}
                step={0.05}
                value={localMinConfidence ?? undefined}
                onChange={(v) =>
                  setLocalMinConfidence(v == null || Number.isNaN(v) ? null : v)
                }
                style={{ width: "100%" }}
                placeholder="e.g. 0.7"
              />
            </Form.Item>
          </>
        )}
        <Form.Item label="Top-K predictions">
          <InputNumber
            min={1}
            max={500}
            value={localK}
            onChange={(v) => setLocalK(v ?? 20)}
            style={{ width: "100%" }}
            disabled={
              isValidateMode ||
              !localTopKOnly ||
              (checkpoints.length === 0 && hasGroundTruthMetadata)
            }
          />
        </Form.Item>
        {!isValidateMode && (
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
        )}
        {isValidateMode && (
          <Alert
            type="info"
            showIcon
            className="mb-0"
            message="Validate uses confidence ranking"
            description="Returns the top-K unannotated snippets ranked by aggregate confidence over your label selection."
          />
        )}
      </Form>
    </Modal>
  );
};

ALInferenceConfigModal.displayName = "ALInferenceConfigModal";
