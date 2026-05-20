import React from "react";
import { Modal, Form, InputNumber } from "antd";
import { UploadSampleAudio } from "../../components/UploadingAudio";
import type { AnnotateMode } from "./types";

export type ClassicFeedConfigModalProps = {
  open: boolean;
  mode: AnnotateMode;
  feedLimit: number;
  onFeedLimitChange: (v: number) => void;
  similarityState: {
    audioFile: File | null;
    startSec: number;
    endSec: number;
  };
  onSimilarityChange: (value: {
    audioFile: File | null;
    startSec: number;
    endSec: number;
  }) => void;
  onCancel: () => void;
  onOk: () => void | Promise<void>;
  okText: string;
  okDisabled: boolean;
  okLoading: boolean;
};

export const ClassicFeedConfigModal: React.FC<ClassicFeedConfigModalProps> = ({
  open,
  mode,
  feedLimit,
  onFeedLimitChange,
  similarityState,
  onSimilarityChange,
  onCancel,
  onOk,
  okText,
  okDisabled,
  okLoading,
}) => (
  <Modal
    title={mode === "similarity" ? "New similarity feed" : "New random feed"}
    open={open}
    onCancel={onCancel}
    onOk={onOk}
    okText={okText}
    okButtonProps={{
      disabled: okDisabled,
      loading: okLoading,
      style: { backgroundColor: "#1e40af", color: "#fff" },
    }}
  >
    <Form layout="vertical" className="mt-4">
      {mode === "similarity" && <UploadSampleAudio onChange={onSimilarityChange} />}
      <Form.Item
        label="Feed limit"
        tooltip="Maximum number of snippets to include in the feed"
      >
        <InputNumber
          min={1}
          max={1000}
          value={feedLimit}
          onChange={(v) => onFeedLimitChange(v ?? 50)}
          style={{ width: "100%" }}
        />
      </Form.Item>
      {mode === "similarity" && !similarityState.audioFile && (
        <p className="text-xs text-amber-500">
          Upload a reference audio file to enable generation.
        </p>
      )}
    </Form>
  </Modal>
);

ClassicFeedConfigModal.displayName = "ClassicFeedConfigModal";
