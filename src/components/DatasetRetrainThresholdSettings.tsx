import React, { useEffect, useState } from "react";
import {
  Button,
  Form,
  InputNumber,
  Modal,
  Tag,
  Typography,
  message,
} from "antd";
import { EditOutlined, SyncOutlined } from "@ant-design/icons";
import type { Dataset } from "../types";
import { datasetApi, getErrorMessage } from "../services/api";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import { TILE_HEADER_CLASS, TileActionButton } from "./datasets/TileActionButton";

type Props = {
  dataset: Dataset;
};

type FormValues = {
  threshold?: number;
};

export const DatasetRetrainThresholdSettings: React.FC<Props> = ({
  dataset,
}) => {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const canManage = user?.role === "admin" || user?.role === "team_owner";
  const hasOverride = dataset.retrain_after_threshold != null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      threshold: dataset.retrain_after_threshold ?? undefined,
    });
  }, [open, dataset, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await datasetApi.update(Number(dataset.id), {
        retrain_after_threshold: values.threshold ?? null,
      });
      message.success("Retrain threshold saved");
      setOpen(false);
      dispatch(fetchAllDatasets());
    } catch (err: unknown) {
      message.error(
        getErrorMessage(err as { response?: { data?: { detail?: unknown } } }),
      );
    } finally {
      setSaving(false);
    }
  };

  // Only admins and team owners see this setting; annotators do not.
  if (!canManage) return null;

  return (
    <>
      <div className="h-full rounded-lg border border-slate-200 bg-white px-4 py-3.5">
        <div className={TILE_HEADER_CLASS}>
          <p className="m-0 flex items-center gap-2 min-w-0 truncate text-fs-11 font-semibold uppercase tracking-wider text-slate-600 font-ibm-sans">
            <SyncOutlined className="text-slate-500" />
            Auto-retrain
          </p>
          <TileActionButton
            icon={<EditOutlined />}
            onClick={() => setOpen(true)}
          >
            Set threshold
          </TileActionButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-base font-ibm-mono font-semibold text-slate-800">
            {hasOverride
              ? `${dataset.retrain_after_threshold} feedback events`
              : "Using default"}
          </span>
          <Tag color={hasOverride ? "blue" : "default"} className="m-0">
            {hasOverride ? "Custom" : "Default"}
          </Tag>
        </div>
        <p className="m-0 mt-1.5 text-xs text-blue-600 font-ibm-sans">
          Feedback count that triggers auto-retrain for this dataset
        </p>
      </div>

      <Modal
        title={
          <span className="font-ibm-sans">
            Auto-retrain threshold
            <Typography.Text
              type="secondary"
              className="text-sm font-normal ml-2"
            >
              {dataset.name}
            </Typography.Text>
          </span>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        okText="Save"
        confirmLoading={saving}
        destroyOnClose
        width={480}
      >
        <Typography.Paragraph
          type="secondary"
          className="text-sm mb-4 font-ibm-sans"
        >
          Auto-retrain kicks off once this many feedback events have been
          submitted since the last retrain. Leave empty to use the platform
          default.
        </Typography.Paragraph>

        <Form form={form} layout="vertical">
          <Form.Item
            label="Feedback events until retrain"
            name="threshold"
            rules={[{ type: "number", min: 1, message: "Must be at least 1" }]}
            extra="Leave empty to use the platform default"
          >
            <InputNumber
              min={1}
              step={1}
              className="w-full"
              placeholder="Default"
            />
          </Form.Item>
          <Button
            type="link"
            size="small"
            className="px-0"
            onClick={() => form.setFieldsValue({ threshold: undefined })}
          >
            Reset to default
          </Button>
        </Form>
      </Modal>
    </>
  );
};
