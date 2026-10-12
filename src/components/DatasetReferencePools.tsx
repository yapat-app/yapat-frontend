/**
 * DatasetReferencePools — admin-only row on a regular dataset's card showing
 * which reference pools feed its training, with an editor to change them.
 *
 * Dataset-scoped links are editable here. Team-scoped links (made via the API)
 * also apply to this dataset, so they are listed read-only as "via team"
 * rather than hidden.
 */

import { useMemo, useState } from "react";
import { Modal, Select, Tag, Tooltip, message } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchReferenceLinks } from "../redux/features/datasetSlice";
import { syncDatasetReferenceLinks } from "../utils/referenceLinks";
import type { Dataset } from "../types";

type Props = {
  dataset: Dataset;
};

const tagStyle = { fontSize: "var(--text-fs-11)", margin: 0 };

export const DatasetReferencePools: React.FC<Props> = ({ dataset }) => {
  const dispatch = useAppDispatch();
  const { referenceDatasets, referenceLinks } = useAppSelector((s) => s.dataset);
  const datasetId = Number(dataset.id);

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const nameById = useMemo(
    () => new Map(referenceDatasets.map((d) => [Number(d.id), d.name])),
    [referenceDatasets],
  );

  const directIds = useMemo(
    () =>
      referenceLinks
        .filter((l) => l.dataset_id === datasetId)
        .map((l) => l.reference_dataset_id),
    [referenceLinks, datasetId],
  );

  const teamIds = useMemo(
    () =>
      dataset.team_id == null
        ? []
        : referenceLinks
            .filter((l) => l.team_id === Number(dataset.team_id))
            .map((l) => l.reference_dataset_id),
    [referenceLinks, dataset.team_id],
  );

  const options = referenceDatasets.map((d) => ({ value: Number(d.id), label: d.name }));
  const label = (id: number) => nameById.get(id) ?? `Reference #${id}`;

  const openEditor = () => {
    setSelected(directIds);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { failed } = await syncDatasetReferenceLinks(datasetId, selected, referenceLinks);
      if (failed.length > 0) {
        message.warning(`Could not update: ${failed.map(label).join(", ")}`);
      } else {
        message.success("Reference pools updated");
        setEditing(false);
      }
    } finally {
      await dispatch(fetchReferenceLinks());
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 mt-2">
        <span
          style={{
            fontSize: "var(--text-fs-11)",
            color: "#888",
            fontWeight: 600,
            textTransform: "uppercase",
            marginRight: 4,
          }}
        >
          Reference pools
        </span>
        {directIds.length === 0 && teamIds.length === 0 && (
          <span className="text-xs text-gray-400 mr-1">None</span>
        )}
        {directIds.map((id) => (
          <Tag key={`d-${id}`} color="purple" style={tagStyle}>
            {label(id)}
          </Tag>
        ))}
        {teamIds.map((id) => (
          <Tooltip key={`t-${id}`} title="Linked to this dataset's team; change it via the team">
            <Tag style={tagStyle}>{label(id)} (via team)</Tag>
          </Tooltip>
        ))}
        <Tag
          style={{ ...tagStyle, cursor: "pointer", color: "#1890ff", borderColor: "#1890ff", borderStyle: "dashed" }}
          onClick={openEditor}
        >
          Edit
        </Tag>
      </div>

      <Modal
        title={`Reference pools for ${dataset.name}`}
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={save}
        okText="Save"
        confirmLoading={saving}
        destroyOnClose
      >
        <p className="text-sm text-gray-600 mb-3">
          Labelled data from these reference datasets is mixed into every training run
          of this dataset. Reference pools need embeddings from the same model as this
          dataset to be used.
        </p>
        <Select
          mode="multiple"
          allowClear
          className="w-full"
          placeholder={options.length ? "Select reference pools" : "No reference datasets yet"}
          options={options}
          value={selected}
          onChange={setSelected}
          optionFilterProp="label"
        />
      </Modal>
    </>
  );
};
