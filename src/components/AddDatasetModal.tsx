import { Modal, Button, Form, Input, Select, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  createDataset,
  fetchAllDatasets,
} from "../redux/features/datasetSlice";
import { fetchAllteams } from "../redux/features/teamSlice";
import { DatasetPathPicker } from "./DatasetPathPicker";
import type { DatasetCreate, DatasetType } from "../types";
import { getErrorMessage } from "../services/api";

const DATASET_TYPE_OPTIONS: { value: DatasetType; label: string }[] = [
  { value: "PAM", label: "PAM" },
  { value: "FOCAL_RECORDINGS", label: "Focal recordings" },
];

type AddDatasetModalProps = {
  onCreated?: () => void;
};

const AddDatasetModal: React.FC<AddDatasetModalProps> = ({ onCreated }) => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    dispatch(fetchAllteams());
  }, [open, dispatch]);

  const teamOptions = useMemo(
    () =>
      (allTeams ?? []).map((t) => ({
        value: t.id,
        label: t.name,
      })),
    [allTeams],
  );

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload: DatasetCreate = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        source_uri: values.source_uri,
        dataset_type: values.dataset_type,
        team_id:
          values.team_id != null && values.team_id !== ""
            ? Number(values.team_id)
            : undefined,
      };

      await dispatch(createDataset(payload)).unwrap();
      message.success("Dataset created. Scanning recordings in the background.");

      form.resetFields();
      setOpen(false);
      dispatch(fetchAllDatasets());
      onCreated?.();
    } catch (err: unknown) {
      const msg =
        typeof err === "string"
          ? err
          : getErrorMessage(err as { response?: { data?: { detail?: unknown } } });
      message.error(msg || "Failed to create dataset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
        Add Dataset
      </Button>

      <Modal
        title="Add New Dataset"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        okText="Add Dataset"
        confirmLoading={submitting}
        destroyOnClose
        afterClose={() => form.resetFields()}
        width={560}
      >
        <Form layout="vertical" form={form} initialValues={{ dataset_type: "PAM" }}>
          <Form.Item
            label="Dataset name"
            name="name"
            rules={[{ required: true, message: "Dataset name is required" }]}
          >
            <Input placeholder="e.g. European Bird Calls – Spring" />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea
              rows={3}
              placeholder="Optional description of this dataset"
            />
          </Form.Item>

          <Form.Item
            label="Dataset type"
            name="dataset_type"
            rules={[{ required: true, message: "Select a dataset type" }]}
          >
            <Select options={DATASET_TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="Path (data volume)"
            name="source_uri"
            rules={[{ required: true, message: "Select a folder from the data volume" }]}
            extra="Browse into subfolders (e.g. ChorusRF → PrioritySpecies), then select the dataset root folder."
          >
            <DatasetPathPicker key={open ? "open" : "closed"} />
          </Form.Item>

          <Form.Item
            label="Team (optional)"
            name="team_id"
            extra="Leave empty to create an unassigned dataset for later team assignment."
          >
            <Select
              allowClear
              showSearch
              placeholder="No team"
              options={teamOptions}
              filterOption={(input, option) =>
                (option?.label ?? "")
                  .toString()
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default AddDatasetModal;
