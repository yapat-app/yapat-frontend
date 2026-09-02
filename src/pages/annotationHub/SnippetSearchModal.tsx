import React from "react";
import { Modal, Select, Form } from "antd";

export type SnippetSearchModalProps = {
  open: boolean;
  /** Snippet IDs from the current search query (options to show). */
  resultIds: number[];
  /** Currently selected snippet IDs. */
  selectedIds: number[];
  onSelectedChange: (ids: number[]) => void;
  /** Debounced search callback (query = typed digits). */
  onSearch: (query: string) => void;
  loading: boolean;
  onCancel: () => void;
  onApply: () => void;
  applyLoading: boolean;
};

/**
 * Standalone "search snippets by ID" dialog. The user types (part of) a snippet
 * ID, picks one or more, and Applies — the parent then replaces the feed with
 * exactly those snippets. Decoupled from the filter-feed config.
 */
export const SnippetSearchModal: React.FC<SnippetSearchModalProps> = ({
  open,
  resultIds,
  selectedIds,
  onSelectedChange,
  onSearch,
  loading,
  onCancel,
  onApply,
  applyLoading,
}) => {
  // Merge selected IDs into the options so their chips stay labeled even after
  // the search query (and thus resultIds) changes.
  const options = Array.from(new Set([...selectedIds, ...resultIds])).map(
    (id) => ({ value: id, label: `#${id}` }),
  );

  const count = selectedIds.length;

  return (
    <Modal
      title="Search snippets"
      open={open}
      onCancel={onCancel}
      onOk={onApply}
      okText={count > 0 ? `Show ${count} snippet${count === 1 ? "" : "s"}` : "Show"}
      okButtonProps={{
        disabled: count === 0,
        loading: applyLoading,
        style: { backgroundColor: "#1e40af", color: "#fff" },
      }}
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item
          label="Snippet ID"
          tooltip="Type a snippet ID to search this dataset. Pick one or many — the feed will be replaced by exactly the selected snippets."
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            filterOption={false}
            autoFocus
            placeholder="Type a snippet ID…"
            loading={loading}
            value={selectedIds}
            onSearch={onSearch}
            onFocus={() => onSearch("")}
            onChange={(v) => onSelectedChange(v as number[])}
            onClear={() => onSelectedChange([])}
            style={{ width: "100%" }}
            options={options}
            notFoundContent={loading ? "Searching…" : "Type a snippet ID to search"}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

SnippetSearchModal.displayName = "SnippetSearchModal";
