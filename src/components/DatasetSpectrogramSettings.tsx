import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Form,
  InputNumber,
  Modal,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  EditOutlined,
  InfoCircleOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import type { Dataset } from "../types";
import { datasetApi, getErrorMessage } from "../services/api";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import { formatSpectrogramHz } from "../utils/spectrogramConfig";

type Props = {
  dataset: Dataset;
};

type RangeMode = "auto" | "custom";

type FormValues = {
  mode: RangeMode;
  f_min_khz?: number;
  f_max_khz?: number;
};

const PRESETS = [
  { key: "auto", label: "Full band", description: "Nyquist per recording", fMaxKhz: null as number | null },
  { key: "11", label: "0–11 kHz", description: "Common bird PAM", fMaxKhz: 11 },
  { key: "12", label: "0–12 kHz", description: "Extended bird band", fMaxKhz: 12 },
  { key: "8", label: "0–8 kHz", description: "Narrow band", fMaxKhz: 8 },
] as const;

function isCustomRange(dataset: Dataset): boolean {
  return dataset.spectrogram_f_max_hz != null && dataset.spectrogram_f_max_hz > 0;
}

function rangeSummary(dataset: Dataset): { title: string; detail: string } {
  if (!isCustomRange(dataset)) {
    return {
      title: "Full recording band",
      detail: "Adapts to each file (up to Nyquist)",
    };
  }
  const fMin = dataset.spectrogram_f_min_hz ?? 0;
  const fMax = dataset.spectrogram_f_max_hz!;
  return {
    title: `${formatSpectrogramHz(fMin)} – ${formatSpectrogramHz(fMax)}`,
    detail: "Fixed display range for all snippets",
  };
}

export const DatasetSpectrogramSettings: React.FC<Props> = ({ dataset }) => {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const canManage = user?.role === "admin" || user?.role === "team_owner";
  const custom = isCustomRange(dataset);
  const summary = useMemo(() => rangeSummary(dataset), [dataset]);

  const mode = Form.useWatch("mode", form);
  const watchedMax = Form.useWatch("f_max_khz", form);

  useEffect(() => {
    if (!open) return;
    const customRange = isCustomRange(dataset);
    form.setFieldsValue({
      mode: customRange ? "custom" : "auto",
      f_min_khz:
        dataset.spectrogram_f_min_hz != null
          ? dataset.spectrogram_f_min_hz / 1000
          : 0,
      f_max_khz:
        dataset.spectrogram_f_max_hz != null
          ? dataset.spectrogram_f_max_hz / 1000
          : undefined,
    });
  }, [open, dataset, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const useAuto = values.mode === "auto";
      await datasetApi.update(Number(dataset.id), {
        spectrogram_f_min_hz: useAuto
          ? null
          : values.f_min_khz != null
            ? Math.round(values.f_min_khz * 1000)
            : 0,
        spectrogram_f_max_hz: useAuto
          ? null
          : values.f_max_khz != null
            ? Math.round(values.f_max_khz * 1000)
            : null,
      });
      message.success("Spectrogram range saved");
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

  const applyPreset = (fMaxKhz: number | null) => {
    if (fMaxKhz == null) {
      form.setFieldsValue({ mode: "auto", f_min_khz: 0, f_max_khz: undefined });
      return;
    }
    form.setFieldsValue({ mode: "custom", f_min_khz: 0, f_max_khz: fMaxKhz });
  };

  return (
    <>
      <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 max-w-xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600">
              <SoundOutlined />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 font-ibm-sans m-0">
                Annotation spectrogram
              </p>
              <p className="text-sm font-ibm-mono text-slate-800 m-0 mt-0.5 truncate">
                {summary.title}
              </p>
              <p className="text-xs text-slate-500 font-ibm-sans m-0 mt-0.5">
                {summary.detail}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Tag color={custom ? "blue" : "default"} className="m-0">
              {custom ? "Custom range" : "Auto"}
            </Tag>
            {canManage ? (
              <Button
                type="default"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setOpen(true)}
              >
                Set range
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
            Spectrogram frequency range
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
        width={520}
      >
        <Typography.Paragraph type="secondary" className="text-sm mb-4 font-ibm-sans">
          Controls which frequencies are shown when annotating snippets from this dataset.
          Recordings are not resampled — only the display band changes.
        </Typography.Paragraph>

        <Form form={form} layout="vertical" initialValues={{ mode: "auto" as RangeMode }}>
          <Form.Item label="Display mode" name="mode" className="mb-3">
            <Radio.Group className="w-full">
              <Space direction="vertical" className="w-full">
                <Radio value="auto" className="font-ibm-sans">
                  <span className="font-medium">Full recording band</span>
                  <Typography.Text type="secondary" className="block text-xs ml-6">
                    Uses each file&apos;s Nyquist limit (e.g. 22 kHz at 44.1 kHz sample rate)
                  </Typography.Text>
                </Radio>
                <Radio value="custom" className="font-ibm-sans">
                  <span className="font-medium">Fixed frequency cap</span>
                  <Typography.Text type="secondary" className="block text-xs ml-6">
                    Same max frequency for every snippet (recommended for bird PAM)
                  </Typography.Text>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3 mb-4">
            <p className="text-xs font-medium text-slate-600 mb-2 font-ibm-sans">Quick presets</p>
            <Space wrap size={[8, 8]}>
              {PRESETS.map((p) => {
                const active =
                  (p.fMaxKhz == null && mode === "auto") ||
                  (p.fMaxKhz != null && mode === "custom" && watchedMax === p.fMaxKhz);
                return (
                  <Tooltip key={p.key} title={p.description}>
                    <Button
                      size="small"
                      type={active ? "primary" : "default"}
                      onClick={() => applyPreset(p.fMaxKhz)}
                    >
                      {p.label}
                    </Button>
                  </Tooltip>
                );
              })}
            </Space>
          </div>

          {mode === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                label="Min (kHz)"
                name="f_min_khz"
                rules={[{ required: true, message: "Required" }]}
                extra="Usually 0"
              >
                <InputNumber min={0} max={200} step={0.1} className="w-full" />
              </Form.Item>
              <Form.Item
                label="Max (kHz)"
                name="f_max_khz"
                rules={[{ required: true, message: "Set a max frequency" }]}
                extra="e.g. 11 for bird calls"
              >
                <InputNumber min={0.5} max={200} step={0.5} className="w-full" />
              </Form.Item>
            </div>
          )}
        </Form>
      </Modal>
    </>
  );
};
