import type { SortField, SortableProperty } from "../../types/sort";
import { SORTABLE_PROPERTY_LABELS } from "../../types/sort";

type SortCategory = "nonModel" | "model";

interface SortOption {
  value: SortableProperty;
  label: string;
  disabled?: boolean;
  category: SortCategory;
}

export const SORT_PROPERTY_OPTIONS: SortOption[] = [
  { value: "confidence", label: SORTABLE_PROPERTY_LABELS.confidence, category: "model" },
  { value: "composite", label: SORTABLE_PROPERTY_LABELS.composite, category: "model" },
  { value: "uncertainty", label: SORTABLE_PROPERTY_LABELS.uncertainty, category: "model" },
  { value: "diversity", label: SORTABLE_PROPERTY_LABELS.diversity, category: "model" },
  { value: "density", label: SORTABLE_PROPERTY_LABELS.density, category: "model" },
  { value: "time", label: SORTABLE_PROPERTY_LABELS.time, disabled: true, category: "nonModel" },
];

let nextId = 0;
function makeId(): string {
  nextId += 1;
  return `sort-${nextId}`;
}

export function makeSortFieldId(): string {
  return makeId();
}

/** Sort options available given which categories the current phase unlocks. */
export function getAvailableSortOptions(allowNonModel: boolean, allowModel: boolean): SortOption[] {
  return SORT_PROPERTY_OPTIONS.filter(
    (o) => (o.category === "nonModel" && allowNonModel) || (o.category === "model" && allowModel),
  );
}

export function defaultSortFields(allowNonModel: boolean, allowModel: boolean): SortField[] {
  void allowNonModel; // "time" stays a (disabled) dropdown option, never a default row
  const fields: SortField[] = [];
  if (allowModel) {
    fields.push({ id: makeId(), property: "confidence", direction: "desc" });
    fields.push({ id: makeId(), property: "composite", direction: "desc" });
  }
  return fields;
}
