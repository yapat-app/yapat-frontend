/**
 * Shared contract for the recording-metadata CSV that users upload to enrich
 * the recordings of a dataset.
 *
 * The header row is the API between the template we ship and the CSV the user
 * uploads: the backend matches each row to a recording by `file_name` and
 * merges the remaining (non-blank) columns into that recording's metadata.
 * Headers are English and MUST match this list exactly — that's the whole
 * point of shipping a template — so keep this the single source of truth and
 * reuse it from the upload/validation UI rather than re-typing the columns.
 *
 * This is the complete set of columns the feature ships and the backend
 * handles; the downloaded template contains exactly these.
 */

export interface RecordingMetadataColumn {
  /** CSV header, exactly as the backend expects it. */
  key: string;
  /** `file_name` is the required join key; every other column is optional. */
  required: boolean;
  /** Short human hint about the expected format (shown in help UI, not the CSV). */
  hint: string;
}

export const RECORDING_METADATA_COLUMNS: RecordingMetadataColumn[] = [
  { key: "file_name", required: true, hint: "must match the stored recording filename exactly, incl. extension" },
  { key: "recorded_date", required: false, hint: "DD/MM/YYYY" },
  { key: "recorded_time", required: false, hint: "HH:MM (24h)" },
  { key: "location", required: false, hint: "site/locality name — the main grouping value (e.g. Parque Estadual do Rio Negro)" },
  { key: "country", required: false, hint: "text" },
  { key: "state", required: false, hint: "text" },
  { key: "city", required: false, hint: "text" },
];

/** Ordered header keys — reuse for CSV generation and upload validation. */
export const RECORDING_METADATA_HEADERS: string[] =
  RECORDING_METADATA_COLUMNS.map((c) => c.key);

/**
 * One filled example row, keyed by column, so users can see the expected
 * formats (date as DD/MM/YYYY, time as HH:MM, etc.). Optional columns may be
 * left empty.
 */
export const RECORDING_METADATA_EXAMPLE_ROW: Record<string, string> = {
  file_name: "FNJV_0123006_Unidentified_sp._Iranduba_AM_Simone Dena.wav",
  recorded_date: "19/07/2024",
  recorded_time: "12:00",
  location: "Toca do Tatu",
  country: "Brazil",
  state: "Amazonas",
  city: "Iranduba",
};

const TEMPLATE_FILE_NAME = "recording_metadata_template.csv";

/** RFC-4180 field escaping: quote when the value contains a comma, quote, or newline. */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(cells: string[]): string {
  return cells.map(escapeCsvField).join(",");
}

/**
 * Build the metadata template CSV: header row, one filled example row, and one
 * blank row for the user to start filling. Uses CRLF line endings for Excel
 * compatibility. The returned string is UTF-8 (the caller's Blob sets charset).
 */
export function buildRecordingMetadataTemplateCsv(
  columns: string[] = RECORDING_METADATA_HEADERS,
): string {
  const headerRow = toCsvRow(columns);
  const exampleRow = toCsvRow(
    columns.map((h) => RECORDING_METADATA_EXAMPLE_ROW[h] ?? ""),
  );
  const blankRow = toCsvRow(columns.map(() => ""));
  return [headerRow, exampleRow, blankRow].join("\r\n") + "\r\n";
}

/** Generate the template client-side and trigger a browser download. No API call. */
export function downloadRecordingMetadataTemplate(
  fileName: string = TEMPLATE_FILE_NAME,
): void {
  // Prepend a UTF-8 BOM so Excel opens accented locality names correctly.
  const csv = "﻿" + buildRecordingMetadataTemplateCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
