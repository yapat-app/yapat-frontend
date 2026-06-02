import React from "react";
import { Modal, Form, InputNumber, Select } from "antd";
import { UploadSampleAudio } from "../../components/UploadingAudio";
import type { AnnotateMode } from "./types";

export type ClassicFeedConfigModalProps = {
  open: boolean;
  mode: AnnotateMode;
  feedLimit: number;
  onFeedLimitChange: (v: number) => void;
  filterAnnotationStatus: "any" | "annotated" | "unannotated";
  onFilterAnnotationStatusChange: (v: "any" | "annotated" | "unannotated") => void;
  filterLocations: string[];
  onFilterLocationsChange: (v: string[]) => void;
  recordingLocations: string[];
  locationsLoading: boolean;
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

const MODAL_TITLES: Record<string, string> = {
  similarity: "New similarity feed",
  filter: "New filter feed",
  random: "New random feed",
};

export const ClassicFeedConfigModal: React.FC<ClassicFeedConfigModalProps> = ({
  open,
  mode,
  feedLimit,
  onFeedLimitChange,
  filterAnnotationStatus,
  onFilterAnnotationStatusChange,
  filterLocations,
  onFilterLocationsChange,
  recordingLocations,
  locationsLoading,
  similarityState,
  onSimilarityChange,
  onCancel,
  onOk,
  okText,
  okDisabled,
  okLoading,
}) => (
  <Modal
    title={MODAL_TITLES[mode] ?? "New feed"}
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

      {mode === "filter" && (
        <>
          <Form.Item
            label="Location"
            tooltip="Site or locality parsed from recording file names (PAM site code or FNJV locality)"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Any location (select none/one/many)"
              loading={locationsLoading}
              value={filterLocations}
              onChange={(v) => onFilterLocationsChange(v)}
              onClear={() => onFilterLocationsChange([])}
              style={{ width: "100%" }}
              options={recordingLocations.map((loc) => ({
                value: loc,
                label: loc,
              }))}
              notFoundContent={
                locationsLoading
                  ? "Loading locations…"
                  : "No locations parsed from file names yet"
              }
            />
          </Form.Item>
          <Form.Item
            label="Annotation status"
            tooltip="Filter snippets by whether the current user has annotated them"
          >
            <Select
              value={filterAnnotationStatus}
              onChange={onFilterAnnotationStatusChange}
              style={{ width: "100%" }}
              options={[
                { value: "any", label: "Any (annotated + unannotated)" },
                { value: "unannotated", label: "Unannotated only" },
                { value: "annotated", label: "Annotated only" },
              ]}
            />
          </Form.Item>
        </>
      )}

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
