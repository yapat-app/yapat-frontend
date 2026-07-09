import React, { useEffect, useState } from "react";
import {
  Button,
  Form,
  InputNumber,
  Modal,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { EditOutlined, InfoCircleOutlined, SyncOutlined } from "@ant-design/icons";
import type { Dataset } from "../types";
import { datasetApi, getErrorMessage } from "../services/api";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { useAppDispatch, useAppSelector } from "../hooks";

type Props = {
  dataset: Dataset;
};

type FormValues = {
  threshold?: number;
};

export const DatasetRetrainThresholdSettings: React.FC<Props> = ({ dataset }) => {
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

  const handleResetToDefault = () => {
    form.setFieldsValue({ threshold: undefined });
  };

  return (
    <>
      <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 max-w-xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600">
              <SyncOutlined />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 font-ibm-sans m-0">
                Auto-retrain threshold
              </p>
              <p className="text-sm font-ibm-mono text-slate-800 m-0 mt-0.5 truncate">
                {hasOverride
                  ? `${dataset.retrain_after_threshold} feedback events`
                  : "Using default"}
              </p>
              <p className="text-xs text-slate-500 font-ibm-sans m-0 mt-0.5">
                Feedback count that triggers auto-retrain for this dataset
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Tag color={hasOverride ? "blue" : "default"} className="m-0">
              {hasOverride ? "Custom" : "Default"}
            </Tag>
            {canManage ? (
              <Button
                type="default"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setOpen(true)}
              >
                Set threshold
              </Button>
            ) : (
              <Tooltip title="Only admins and team owners can change this">
                <InfoCircleOutlined className="text-slate-400" />
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      <Modal
        title={
          <span className="font-ibm-sans">
            Auto-retrain threshold
            <Typography.Text type="secondary" className="text-sm font-normal ml-2">
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
        <Typography.Paragraph type="secondary" className="text-sm mb-4 font-ibm-sans">
          Auto-retrain kicks off once this many feedback events have been submitted
          since the last retrain. Leave empty to use the platform default.
        </Typography.Paragraph>

        <Form form={form} layout="vertical">
          <Form.Item
            label="Feedback events until retrain"
            name="threshold"
            rules={[{ type: "number", min: 1, message: "Must be at least 1" }]}
            extra="Leave empty to use the platform default"
          >
            <InputNumber min={1} step={1} className="w-full" placeholder="Default" />
          </Form.Item>
          <Button type="link" size="small" className="px-0" onClick={handleResetToDefault}>
            Reset to default
          </Button>
        </Form>
      </Modal>
    </>
  );
};
