// Parses quick-label files (JSON / CSV / TXT / pasted text) for the import tab
// of DatasetQuickLabelsModal and classifies each entry against the draft list.
// Kept free of runtime imports so tests/quickLabelImport.test.ts can run it
// directly under node.
import type { QuickLabel } from "../types";

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ENTRIES = 2000;

export class QuickLabelImportError extends Error {}

export type ImportFormat = "json" | "csv" | "txt" | "paste";

export type ImportStatus = "new" | "existing" | "duplicate";

export interface ImportPreviewRow {
  key: string;
  label: QuickLabel;
  /** Human name of the taxon_id namespace, e.g. "GBIF" or "Local". */
  source: string;
  status: ImportStatus;
  /**
   * Set when the name differs from an existing or earlier name only by case or
   * underscore vs space. The model treats those as different labels.
   */
  similarTo?: string;
}

const NAMESPACES: Record<string, string> = {
  gbif: "GBIF",
  envo: "ENVO",
  local: "Local",
  custom: "Custom",
  wiki: "Wiki",
  ols: "OLS",
};

const NAMESPACED_ID = /^(gbif|envo|local|custom|wiki|ols):\S+$/i;

const HEADER_NAMES = new Set([
  "name",
  "names",
  "display_name",
  "display name",
  "label",
  "labels",
  "species",
  "scientific_name",
  "scientific name",
  "taxon",
  "taxon_id",
]);

/** Same slug rule as the Local tab: lowercase, spaces→_, [a-z0-9_-] only, ≤120. */
export function localSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 120);
}

export function localLabel(name: string): QuickLabel {
  const display = name.trim();
  return { taxon_id: `local:${localSlug(display) || "label"}`, display_name: display };
}

export function sourceOf(taxonId: string): string {
  const ns = taxonId.split(":", 1)[0].toLowerCase();
  return NAMESPACES[ns] ?? "Local";
}

export function formatFromFileName(fileName: string): ImportFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "json" || ext === "csv" || ext === "txt") return ext;
  return null;
}

function fromEntry(entry: unknown): QuickLabel | null {
  if (typeof entry === "string") {
    return entry.trim() ? localLabel(entry) : null;
  }
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const rawId = typeof obj.taxon_id === "string" ? obj.taxon_id.trim() : "";
    const rawName = [obj.display_name, obj.name, obj.label].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    const namespaced = NAMESPACED_ID.test(rawId);
    const name = rawName?.trim() ?? (namespaced ? rawId.slice(rawId.indexOf(":") + 1) : rawId);
    if (!name) return null;
    return namespaced ? { taxon_id: rawId, display_name: name } : localLabel(name);
  }
  return null;
}

function parseJson(text: string): QuickLabel[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new QuickLabelImportError(
      `Couldn't read this file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (data && !Array.isArray(data) && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    data = obj.labels ?? obj.quick_labels;
  }
  if (!Array.isArray(data)) {
    throw new QuickLabelImportError(
      "Couldn't read this file: expected a list of labels, or an object with a \"labels\" list",
    );
  }
  checkCount(data.length);
  return data.map(fromEntry).filter((l): l is QuickLabel => l !== null);
}

/** Splits one CSV line, honouring double-quoted fields. */
function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

const isHeader = (cell: string | undefined) =>
  cell !== undefined && HEADER_NAMES.has(cell.trim().toLowerCase());

function parseLines(text: string, format: "csv" | "txt" | "paste"): QuickLabel[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let rows: string[][];
  if (format === "csv") {
    rows = lines.map(csvFields);
  } else if (format === "paste") {
    rows = lines.flatMap((l) => l.split(",")).map((n) => [n.trim()]);
  } else {
    rows = lines.map((l) => [l.trim()]);
  }

  let nameCol = 0;
  let idCol = -1;
  if (rows.length > 0 && isHeader(rows[0][0])) {
    const header = rows[0].map((h) => h.toLowerCase());
    const named = header.findIndex((h) => h !== "taxon_id" && HEADER_NAMES.has(h));
    nameCol = named >= 0 ? named : 0;
    idCol = header.indexOf("taxon_id");
    rows = rows.slice(1);
  }

  rows = rows.filter((r) => (r[nameCol] ?? "").trim() !== "");
  checkCount(rows.length);
  return rows
    .map((r) => fromEntry(idCol >= 0 ? { taxon_id: r[idCol] ?? "", name: r[nameCol] } : r[nameCol]))
    .filter((l): l is QuickLabel => l !== null);
}

function checkCount(n: number) {
  if (n > MAX_IMPORT_ENTRIES) {
    throw new QuickLabelImportError(
      `This file has ${n.toLocaleString()} entries; the limit is ${MAX_IMPORT_ENTRIES.toLocaleString()}.`,
    );
  }
}

export function checkFileSize(bytes: number) {
  if (bytes > MAX_IMPORT_BYTES) {
    throw new QuickLabelImportError("This file is larger than 1 MB; split it into smaller files.");
  }
}

/**
 * Turns file or pasted text into quick labels, in file order. JSON is tried for
 * .json files and for pasted text that looks like JSON. Throws
 * QuickLabelImportError with a user-facing message.
 */
export function parseQuickLabelText(text: string, format: ImportFormat): QuickLabel[] {
  checkFileSize(new TextEncoder().encode(text).length);
  const body = text.replace(/^\uFEFF/, "");
  const trimmed = body.trim();
  if (format === "json" || (format === "paste" && /^[[{]/.test(trimmed))) {
    return parseJson(trimmed);
  }
  return parseLines(body, format);
}

/** "Adenomera_andreae" and "adenomera  andreae" share this key. */
const looseKey = (name: string) => name.toLowerCase().replace(/[_\s]+/g, " ").trim();

/**
 * Classifies incoming labels against the draft list: already present (same
 * taxon_id or same name ignoring case), duplicated earlier in the file, or new,
 * with a "similar" warning when only case or underscore/space differ.
 */
export function buildImportPreview(
  incoming: QuickLabel[],
  existing: QuickLabel[],
): ImportPreviewRow[] {
  const existingIds = new Set(existing.map((l) => l.taxon_id));
  const existingNames = new Set(existing.map((l) => l.display_name.trim().toLowerCase()));
  const loose = new Map<string, string>();
  for (const l of existing) {
    const k = looseKey(l.display_name);
    if (!loose.has(k)) loose.set(k, l.display_name);
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  return incoming.map((label, i) => {
    const name = label.display_name.trim().toLowerCase();
    let status: ImportStatus = "new";
    if (existingIds.has(label.taxon_id) || existingNames.has(name)) status = "existing";
    else if (seenIds.has(label.taxon_id) || seenNames.has(name)) status = "duplicate";

    const k = looseKey(label.display_name);
    const match = loose.get(k);
    const similarTo =
      status === "new" && match !== undefined && match.trim().toLowerCase() !== name
        ? match
        : undefined;

    seenIds.add(label.taxon_id);
    seenNames.add(name);
    if (!loose.has(k)) loose.set(k, label.display_name);
    return { key: `${i}:${label.taxon_id}`, label, source: sourceOf(label.taxon_id), status, similarTo };
  });
}
