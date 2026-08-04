/**
 * Quick labels that entered the palette while annotating.
 *
 * Today the only producer is a participant picking a species from the GBIF
 * search box in LabelSelector: the pick is pinned so the next snippet needs no
 * second search. Entries with `owned: false` are dataset-wide (the lane the
 * Ontology Engineering service writes into) — visible, but not removable here.
 *
 * Reads the dataset from the AL slice rather than taking it as a prop, so the
 * six components that already drill `quickLabels` don't grow three more props.
 *
 * State lives in a module-level store, not in the hook: PredictionFeed renders
 * one LabelSelector per visible card, so per-instance state would mean N
 * identical GETs on mount and a promotion in one card going unnoticed by its
 * neighbours. One store, one fetch, every card in sync.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAppSelector } from "../hooks";
import { datasetApi } from "../services/api";
import { studyLogger } from "../studyLogging";
import type { QuickLabelEntry, QuickLabelEntryCreate } from "../types";

export interface PersonalQuickLabels {
  entries: QuickLabelEntry[];
  /** Lower-cased display names of the caller's own entries. */
  ownedNames: Set<string>;
  promote: (label: QuickLabelEntryCreate) => void;
  remove: (taxonId: string) => void;
}

interface StoreState {
  datasetId: number | null;
  entries: QuickLabelEntry[];
}

let state: StoreState = { datasetId: null, entries: [] };
const listeners = new Set<() => void>();

// Bumped on every dataset switch so a slow response for the previous dataset
// cannot land on top of the current one.
let loadToken = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function setState(next: StoreState) {
  state = next;
  emit();
}

/** Load once per dataset. Extra callers are no-ops while the dataset is
 *  unchanged, which is what keeps N mounted cards down to a single request. */
function ensureLoaded(datasetId: number | null) {
  if (state.datasetId === datasetId) return;

  const token = ++loadToken;
  setState({ datasetId, entries: [] });
  if (datasetId == null) return;

  void datasetApi
    .getMyQuickLabels(datasetId)
    .then((rows) => {
      if (token === loadToken) setState({ datasetId, entries: rows });
    })
    .catch(() => {
      /* leave the palette empty; the checkpoint labels still render */
    });
}

export function usePersonalQuickLabels(): PersonalQuickLabels {
  const { selectedDatasetId } = useAppSelector((s) => s.al);
  const datasetId = selectedDatasetId != null ? Number(selectedDatasetId) : null;

  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ensureLoaded(datasetId);
  }, [datasetId]);

  const promote = useCallback(
    (label: QuickLabelEntryCreate) => {
      if (datasetId == null || state.datasetId !== datasetId) return;
      // Already pinned — no request needed.
      if (state.entries.some((e) => e.taxon_id === label.taxon_id)) return;

      // Optimistic: the chip appears immediately. A failed promotion must never
      // block or undo the annotation itself, so this only rolls back the chip.
      const optimistic: QuickLabelEntry = {
        id: -Date.now(),
        taxon_id: label.taxon_id,
        display_name: label.display_name,
        rank: label.rank ?? null,
        source: label.source ?? "gbif",
        created_at: new Date().toISOString(),
        owned: true,
      };
      const token = loadToken;
      setState({ datasetId, entries: [optimistic, ...state.entries] });

      studyLogger.log("quick_label_promoted", {
        taxonId: label.taxon_id,
        label: label.display_name,
        source: label.source ?? "gbif",
      });

      void datasetApi
        .addMyQuickLabels(datasetId, [label])
        .then((rows) => {
          if (token === loadToken) setState({ datasetId, entries: rows });
        })
        .catch(() => {
          if (token === loadToken) {
            setState({
              datasetId,
              entries: state.entries.filter((e) => e.id !== optimistic.id),
            });
          }
        });
    },
    [datasetId],
  );

  const remove = useCallback(
    (taxonId: string) => {
      if (datasetId == null || state.datasetId !== datasetId) return;

      const removed = state.entries.find((e) => e.taxon_id === taxonId);
      // Dataset-wide entries are not the participant's to delete.
      if (!removed?.owned) return;

      const token = loadToken;
      setState({
        datasetId,
        entries: state.entries.filter((e) => e.taxon_id !== taxonId),
      });
      studyLogger.log("quick_label_removed", {
        taxonId,
        label: removed.display_name,
      });

      void datasetApi.deleteMyQuickLabel(datasetId, taxonId).catch(() => {
        if (token === loadToken && state.datasetId === datasetId) {
          setState({ datasetId, entries: [removed, ...state.entries] });
        }
      });
    },
    [datasetId],
  );

  const ownedNames = useMemo(
    () =>
      new Set(
        snapshot.entries
          .filter((e) => e.owned)
          .map((e) => e.display_name.toLowerCase()),
      ),
    [snapshot.entries],
  );

  return { entries: snapshot.entries, ownedNames, promote, remove };
}
