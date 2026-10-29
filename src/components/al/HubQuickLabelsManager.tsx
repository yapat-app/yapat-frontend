/**
 * Opens the dataset's Quick Labels dialog from the Annotation Hub, so admins
 * and team owners can add labels without leaving the feed. Mounted once by the
 * hub; the label bar on every feed card only fires the open event, so the feed
 * never mounts one dialog per card.
 */
import React, { useEffect, useState } from "react";
import { useAppSelector } from "../../hooks";
import { DatasetQuickLabelsModal } from "../DatasetQuickLabelsModal";
import { setCachedQuickLabels } from "../datasets/quickLabelsCache";
import { invalidateQuickLabelList } from "../../hooks/useQuickLabelList";
import { OPEN_QUICK_LABELS_MANAGER, useCanManageQuickLabels } from "./quickLabelsManagerEvents";

export const HubQuickLabelsManager: React.FC = () => {
  const canManage = useCanManageQuickLabels();
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const allDatasets = useAppSelector((s) => s.dataset.allDatasets);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_QUICK_LABELS_MANAGER, onOpen);
    return () => window.removeEventListener(OPEN_QUICK_LABELS_MANAGER, onOpen);
  }, []);

  const dataset = allDatasets.find((d) => Number(d.id) === Number(selectedDatasetId));
  if (!canManage || !dataset) return null;

  return (
    <DatasetQuickLabelsModal
      dataset={dataset}
      open={open}
      onClose={() => setOpen(false)}
      onSaved={(saved) => {
        setCachedQuickLabels(Number(dataset.id), saved);
        invalidateQuickLabelList();
      }}
    />
  );
};
