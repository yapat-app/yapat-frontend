import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Spin, Tag, Tooltip, message } from "antd";
import { CloseOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import type { Dataset, QuickLabel } from "../types";
import { datasetApi, taxonomyApi } from "../services/api";

type Source = "gbif" | "envo" | "local";

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
      .then(setLabels)
      .catch(() => setLabels([]))
      .finally(() => setLoading(false));
  }, [open, dataset.id]);

  useEffect(() => {
    if (source === "local") {
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

  const addLabel = (label: QuickLabel) => {
    if (labels.some((l) => l.taxon_id === label.taxon_id)) return;
    setLabels((prev) => [...prev, label]);
  };

  const removeLabel = (taxon_id: string) =>
    setLabels((prev) => prev.filter((l) => l.taxon_id !== taxon_id));

  const addLocal = () => {
    const display = localInput.trim();
    if (!display) return;
    const slug = display
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 120);
    addLabel({ taxon_id: `local:${slug || "label"}`, display_name: display });
    setLocalInput("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await datasetApi.putQuickLabels(Number(dataset.id), labels);
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
  ];

  return (
    <Modal
      title={`Quick Labels — ${dataset.name}`}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={save}>
          Save
        </Button>,
      ]}
      width={700}
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
                fontSize: 11,
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
                <span style={{ color: "#bbb", fontSize: 12 }}>
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
                  <Tooltip title={l.taxon_id}>
                    <span style={{ fontSize: 13 }}>{l.display_name}</span>
                  </Tooltip>
                  <CloseOutlined
                    style={{ color: "#ff4d4f", cursor: "pointer", fontSize: 11 }}
                    onClick={() => removeLabel(l.taxon_id)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right: add labels */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
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
                    fontSize: 12,
                    background: source === p.key ? "#1890ff" : "#f0f0f0",
                    color: source === p.key ? "#fff" : "#555",
                    borderColor: source === p.key ? "#1890ff" : "#d9d9d9",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {source === "local" ? (
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
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <span>{r.display_name}</span>
                        <span style={{ color: "#bbb", fontSize: 11, marginLeft: 6 }}>
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
                    <div style={{ color: "#bbb", fontSize: 12, padding: "8px 0" }}>
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
