import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Spin, Tooltip, message } from "antd";
import { CloseOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import type { Dataset, QuickLabel } from "../types";
import { datasetApi, taxonomyApi } from "../services/api";
import { invalidateQuickLabelScientificNames } from "../hooks/useQuickLabelScientificNames";
import { SCROLL_MODAL_PROPS } from "./datasets/modalLayout";
import { QuickLabelImportPanel } from "./QuickLabelImportPanel";
import { localLabel } from "../utils/quickLabelImport";

type Source = "gbif" | "envo" | "local" | "import";

type Props = {
  dataset: Dataset;
  open: boolean;
  onClose: () => void;
  onSaved: (labels: QuickLabel[]) => void;
};

export const DatasetQuickLabelsModal: React.FC<Props> = ({
  dataset,
  open,
  onClose,
  onSaved,
}) => {
  const [labels, setLabels] = useState<QuickLabel[]>([]);
  // taxon_ids already stored for the dataset. Only rows outside this set may be
  // renamed: annotations store the label name, so renaming a saved label would
  // split its existing annotations from the new ones.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<Source>("gbif");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickLabel[]>([]);
  const [searching, setSearching] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    datasetApi
      .getQuickLabels(Number(dataset.id))
      .then((rows) => {
        setLabels(rows);
        setSavedIds(new Set(rows.map((r) => r.taxon_id)));
      })
      .catch(() => {
        setLabels([]);
        setSavedIds(new Set());
      })
      .finally(() => setLoading(false));
  }, [open, dataset.id]);

  useEffect(() => {
    if (source === "local" || source === "import") {
      setResults([]);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (source === "gbif") {
          const res = await taxonomyApi.suggest(query, 10);
          setResults(
            res.map((r) => ({
              taxon_id: r.taxon_id,
              display_name: r.canonical_name ?? r.taxon_id,
            })),
          );
        } else {
          const res = await taxonomyApi.envoSuggest(query, 10);
          setResults(res);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query, source]);

  const addLabel = (label: QuickLabel) =>
    setLabels((prev) =>
      prev.some((l) => l.taxon_id === label.taxon_id) ? prev : [...prev, label],
    );

  const addImported = (rows: QuickLabel[]) => {
    rows.forEach(addLabel);
    message.success(
      `Added ${rows.length} ${rows.length === 1 ? "label" : "labels"} — remember to Save`,
    );
  };

  const removeLabel = (taxon_id: string) =>
    setLabels((prev) => prev.filter((l) => l.taxon_id !== taxon_id));

  // Lets a GBIF/ENVO pick carry a short code (e.g. "ALYALM") while keeping its
  // taxon_id, so the label stays linked to the taxonomy.
  const renameLabel = (taxon_id: string, display_name: string) =>
    setLabels((prev) =>
      prev.map((l) => (l.taxon_id === taxon_id ? { ...l, display_name } : l)),
    );

  // Chips and annotations match labels by name, case-insensitively, so two
  // labels sharing a name would be indistinguishable once saved.
  const nameCounts = new Map<string, number>();
  for (const l of labels) {
    const key = l.display_name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const isInvalidName = (l: QuickLabel) => {
    const key = l.display_name.trim().toLowerCase();
    return !key || (nameCounts.get(key) ?? 0) > 1;
  };
  const hasInvalidNames = labels.some(isInvalidName);

  const addLocal = () => {
    if (!localInput.trim()) return;
    addLabel(localLabel(localInput));
    setLocalInput("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await datasetApi.putQuickLabels(
        Number(dataset.id),
        labels.map((l) => ({ ...l, display_name: l.display_name.trim() })),
      );
      // Tooltips cache scientific names per dataset; refresh them on next use.
      invalidateQuickLabelScientificNames(Number(dataset.id));
      onSaved(saved);
      message.success("Quick labels saved");
      onClose();
    } catch {
      message.error("Failed to save quick labels");
    } finally {
      setSaving(false);
    }
  };

  const sourcePills: { key: Source; label: string }[] = [
    { key: "gbif", label: "🌿 GBIF" },
    { key: "envo", label: "🌍 ENVO" },
    { key: "local", label: "✏️ Local" },
    { key: "import", label: "📄 Import" },
  ];

  return (
    <Modal
        {...SCROLL_MODAL_PROPS}
      title={`Quick Labels — ${dataset.name}`}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={saving}
          disabled={hasInvalidNames}
          onClick={save}
        >
          Save
        </Button>,
      ]}
      width={source === "import" ? 860 : 700}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, minHeight: 320 }}>
          {/* Left: current labels */}
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #f0f0f0",
              paddingRight: 16,
            }}
          >
            <div
              style={{
                fontSize: "var(--text-fs-11)",
                color: "#888",
                marginBottom: 8,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              Current Labels ({labels.length})
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 360,
                overflowY: "auto",
              }}
            >
              {labels.length === 0 && (
                <span style={{ color: "#bbb", fontSize: "var(--text-fs-12)" }}>
                  No labels yet. Add from the right panel.
                </span>
              )}
              {labels.map((l) => (
                <div
                  key={l.taxon_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fafafa",
                    borderRadius: 4,
                    padding: "4px 8px",
                  }}
                >
                  {savedIds.has(l.taxon_id) ? (
                    <Tooltip title={l.taxon_id}>
                      <span
                        style={{
                          fontSize: "var(--text-fs-13)",
                          color: isInvalidName(l) ? "#ff4d4f" : undefined,
                        }}
                      >
                        {l.display_name}
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip title={`${l.taxon_id} · New label: rename it before saving, e.g. to a short code`}>
                      <Input
                        size="small"
                        value={l.display_name}
                        onChange={(e) => renameLabel(l.taxon_id, e.target.value)}
                        status={isInvalidName(l) ? "error" : undefined}
                        aria-label={`Name for ${l.taxon_id}`}
                        style={{ marginRight: 8 }}
                      />
                    </Tooltip>
                  )}
                  <CloseOutlined
                    style={{ color: "#ff4d4f", cursor: "pointer", fontSize: "var(--text-fs-11)" }}
                    onClick={() => removeLabel(l.taxon_id)}
                  />
                </div>
              ))}
            </div>
            {hasInvalidNames && (
              <div style={{ color: "#ff4d4f", fontSize: "var(--text-fs-12)", marginTop: 8 }}>
                Each label needs a unique, non-empty name.
              </div>
            )}
          </div>

          {/* Right: add labels */}
          <div style={{ flex: source === "import" ? 1.6 : 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--text-fs-11)",
                color: "#888",
                marginBottom: 8,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              Add Labels
            </div>

            {/* Source pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {sourcePills.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setSource(p.key);
                    setQuery("");
                    setResults([]);
                  }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 4,
                    border: "1px solid",
                    cursor: "pointer",
                    fontSize: "var(--text-fs-12)",
                    background: source === p.key ? "#1890ff" : "#f0f0f0",
                    color: source === p.key ? "#fff" : "#555",
                    borderColor: source === p.key ? "#1890ff" : "#d9d9d9",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {source === "import" ? (
              <QuickLabelImportPanel
                datasetId={Number(dataset.id)}
                labels={labels}
                onAdd={addImported}
              />
            ) : source === "local" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Input
                  placeholder="e.g. Wind, No biophony, Rain…"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  onPressEnter={addLocal}
                  size="small"
                />
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addLocal}
                >
                  Add
                </Button>
              </div>
            ) : (
              <>
                <Input
                  prefix={<SearchOutlined style={{ color: "#bbb" }} />}
                  placeholder={
                    source === "gbif"
                      ? "Search species e.g. Turdus merula…"
                      : "Search ENVO terms e.g. rain, wind…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  size="small"
                  suffix={searching ? <Spin size="small" /> : null}
                />
                <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
                  {results.map((r) => (
                    <div
                      key={r.taxon_id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "4px 0",
                        borderBottom: "1px solid #f5f5f5",
                        fontSize: "var(--text-fs-12)",
                      }}
                    >
                      <div>
                        <span>{r.display_name}</span>
                        <span style={{ color: "#bbb", fontSize: "var(--text-fs-11)", marginLeft: 6 }}>
                          {r.taxon_id}
                        </span>
                      </div>
                      <Button
                        size="small"
                        type="link"
                        icon={<PlusOutlined />}
                        disabled={labels.some((l) => l.taxon_id === r.taxon_id)}
                        onClick={() => addLabel(r)}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                  {!searching && query.trim() && results.length === 0 && (
                    <div style={{ color: "#bbb", fontSize: "var(--text-fs-12)", padding: "8px 0" }}>
                      No results found.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
