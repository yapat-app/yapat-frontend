import { Modal, Button, Form, Input, InputNumber, Radio, Select, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  createDataset,
  fetchAllDatasets,
  fetchReferenceDatasets,
  fetchReferenceLinks,
} from "../redux/features/datasetSlice";
import { fetchAllteams } from "../redux/features/teamSlice";
import { DatasetPathPicker } from "./DatasetPathPicker";
import type { DatasetCreate, DatasetType } from "../types";
import { getErrorMessage } from "../services/api";
import { syncDatasetReferenceLinks } from "../utils/referenceLinks";
import { SCROLL_MODAL_PROPS } from "./datasets/modalLayout";

const DATASET_TYPE_OPTIONS: { value: DatasetType; label: string }[] = [
  { value: "PAM", label: "PAM" },
  { value: "FOCAL_RECORDINGS", label: "Focal recordings" },
];

type DatasetKind = "regular" | "reference";

type AddDatasetModalProps = {
  onCreated?: () => void;
};

const AddDatasetModal: React.FC<AddDatasetModalProps> = ({ onCreated }) => {
  const dispatch = useAppDispatch();
  const { allTeams } = useAppSelector((state) => state.team);
  const { referenceDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  // Reference pools are admin-managed; the backend rejects these fields otherwise.
  const isAdmin = user?.role === "admin";

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const kind: DatasetKind = Form.useWatch("kind", form) ?? "regular";
  const sourceUri: string | undefined = Form.useWatch("source_uri", form);

  useEffect(() => {
    if (!open) return;
    dispatch(fetchAllteams());
    if (isAdmin) dispatch(fetchReferenceDatasets());
  }, [open, isAdmin, dispatch]);

  const referenceOptions = useMemo(
    () => referenceDatasets.map((d) => ({ value: Number(d.id), label: d.name })),
    [referenceDatasets],
  );

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

      const isReference = isAdmin && values.kind === "reference";
      const payload: DatasetCreate = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        source_uri: values.source_uri,
        dataset_type: values.dataset_type,
        // Reference pools are shared across teams, so they never get one.
        team_id:
          !isReference && values.team_id != null && values.team_id !== ""
            ? Number(values.team_id)
            : undefined,
        spectrogram_f_max_hz:
          values.f_max_khz != null ? Math.round(values.f_max_khz * 1000) : undefined,
        ...(isReference && {
          is_reference: true,
          reference_metadata_path: values.reference_metadata_path?.trim() || undefined,
        }),
      };

      const created = await dispatch(createDataset(payload)).unwrap();
      message.success("Dataset created. Scanning recordings in the background.");

      // Links are created after the dataset exists. A failure here leaves the
      // dataset in place; the admin can retry from the card's Reference pools row.
      const poolIds: number[] = !isReference ? values.reference_pool_ids ?? [] : [];
      if (poolIds.length > 0) {
        const { failed } = await syncDatasetReferenceLinks(
          Number(created.dataset.id),
          poolIds,
          [],
        );
        if (failed.length > 0) {
          message.warning(
            "Some reference pools could not be linked. Edit them on the dataset card.",
          );
        }
      }

      form.resetFields();
      setOpen(false);
      dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
      if (isAdmin) dispatch(fetchReferenceLinks());
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
      <Button
        type="primary"
        size="large"
        icon={<PlusOutlined />}
        onClick={() => setOpen(true)}
      >
        Add Dataset
      </Button>

      <Modal
        {...SCROLL_MODAL_PROPS}
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
        <Form
          layout="vertical"
          form={form}
          // Room between fields, so each question and its helper text read as a
          // group of their own.
          className="[&_.ant-form-item]:mb-7! [&_.ant-form-item-extra]:mt-1.5 [&_.ant-form-item-label]:pb-2"
          initialValues={{ dataset_type: "PAM", kind: "regular" }}
        >
          {isAdmin && (
            <Form.Item
              label="What kind of dataset?"
              name="kind"
              extra={
                kind === "reference"
                  ? "Labelled training data for other datasets. It is never annotated directly and only admins can see it."
                  : "Audio that users annotate."
              }
            >
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button value="regular">Regular dataset</Radio.Button>
                <Radio.Button value="reference">Reference dataset</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

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
            label="Max spectrogram frequency (kHz)"
            name="f_max_khz"
            extra="Optional. e.g. 11 for bird PAM. Empty = full band per recording."
          >
            <InputNumber min={0.1} max={200} step={0.5} className="w-full" placeholder="Auto" />
          </Form.Item>

          {kind === "reference" ? (
            <Form.Item
              label="Label file (optional)"
              name="reference_metadata_path"
              extra={
                <>
                  CSV with one row per labelled event (fname, onset, offset, species).
                  Leave empty to use{" "}
                  <code>{`${sourceUri || "<path>"}/pam_metadata.csv`}</code>. A path
                  with “/” is read from the data volume root.
                </>
              }
            >
              <Input placeholder="pam_metadata.csv" />
            </Form.Item>
          ) : (
            <>
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

              {isAdmin && (
                <Form.Item
                  label="Reference pools to use (optional)"
                  name="reference_pool_ids"
                  extra="Labelled data from these reference datasets is mixed into this dataset's model training. You can change this later on the dataset card."
                >
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder={
                      referenceOptions.length ? "None" : "No reference datasets yet"
                    }
                    options={referenceOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </Modal>
    </>
  );
};

export default AddDatasetModal;
