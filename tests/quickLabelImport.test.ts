// Run with `npm test` (node's built-in runner; node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMPORT_ENTRIES,
  QuickLabelImportError,
  buildImportPreview,
  checkFileSize,
  localLabel,
  localSlug,
  parseQuickLabelText,
} from "../src/utils/quickLabelImport.ts";

test("a) JSON objects keep namespaced taxon_ids, plain ids become local names", () => {
  const text = JSON.stringify([
    { taxon_id: "local:adenomera_andreae", display_name: "Adenomera_andreae" },
    { taxon_id: "gbif:2422334", display_name: "Rhinella marina" },
    { taxon_id: "12345", display_name: "Boana boans" },
    { display_name: "  " },
  ]);
  assert.deepEqual(parseQuickLabelText(text, "json"), [
    { taxon_id: "local:adenomera_andreae", display_name: "Adenomera_andreae" },
    { taxon_id: "gbif:2422334", display_name: "Rhinella marina" },
    { taxon_id: "local:boana_boans", display_name: "Boana boans" },
  ]);
});

test("b) JSON array of strings", () => {
  assert.deepEqual(parseQuickLabelText('["Adenomera andreae", " No biophony ", ""]', "json"), [
    { taxon_id: "local:adenomera_andreae", display_name: "Adenomera andreae" },
    { taxon_id: "local:no_biophony", display_name: "No biophony" },
  ]);
});

test("c) wrapped in { labels } or { quick_labels }", () => {
  const expected = [{ taxon_id: "local:wind", display_name: "Wind" }];
  assert.deepEqual(parseQuickLabelText('{"labels": ["Wind"]}', "json"), expected);
  assert.deepEqual(
    parseQuickLabelText('{"quick_labels": [{"taxon_id": "local:wind", "display_name": "Wind"}]}', "json"),
    expected,
  );
});

test("d) txt is one name per line, header skipped", () => {
  assert.deepEqual(parseQuickLabelText("species\nWind\n\r\nRain, heavy\n", "txt"), [
    localLabel("Wind"),
    localLabel("Rain, heavy"),
  ]);
});

test("d) csv takes the first column and skips a header", () => {
  const text = 'name,count\nWind,3\n"Rain, heavy",4\n';
  assert.deepEqual(parseQuickLabelText(text, "csv"), [localLabel("Wind"), localLabel("Rain, heavy")]);
  assert.deepEqual(parseQuickLabelText("Wind,3\nRain,4", "csv"), [localLabel("Wind"), localLabel("Rain")]);
});

test("d) csv with taxon_id,display_name header keeps the ids", () => {
  const text = "taxon_id,display_name\ngbif:1,Rhinella marina\n";
  assert.deepEqual(parseQuickLabelText(text, "csv"), [
    { taxon_id: "gbif:1", display_name: "Rhinella marina" },
  ]);
});

test("paste splits on lines and commas, and accepts JSON", () => {
  assert.deepEqual(parseQuickLabelText("Wind, Rain\nInsects", "paste"), [
    localLabel("Wind"),
    localLabel("Rain"),
    localLabel("Insects"),
  ]);
  assert.deepEqual(parseQuickLabelText('["Wind"]', "paste"), [localLabel("Wind")]);
});

test("slug matches the Local tab rule", () => {
  assert.equal(localSlug("Adenomera  Andreae (calls)!"), "adenomera_andreae_calls");
  assert.equal(localSlug("x".repeat(200)).length, 120);
  assert.equal(localLabel("!!!").taxon_id, "local:label");
});

test("bad JSON reports a readable error", () => {
  assert.throws(
    () => parseQuickLabelText("[{", "json"),
    (e: unknown) => e instanceof QuickLabelImportError && e.message.startsWith("Couldn't read this file: "),
  );
  assert.throws(() => parseQuickLabelText('{"foo": 1}', "json"), QuickLabelImportError);
});

test("size and entry limits", () => {
  assert.throws(() => checkFileSize(1024 * 1024 + 1), /larger than 1 MB/);
  const many = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_, i) => `n${i}`).join("\n");
  assert.throws(() => parseQuickLabelText(many, "txt"), /limit is 2,000/);
  assert.throws(() => parseQuickLabelText(JSON.stringify(many.split("\n")), "json"), /limit/);
  assert.equal(parseQuickLabelText(many.split("\n").slice(1).join("\n"), "txt").length, 2000);
});

test("preview: existing by taxon_id or case-insensitive name, duplicates in file", () => {
  const existing = [
    { taxon_id: "gbif:1", display_name: "Rhinella marina" },
    { taxon_id: "local:wind", display_name: "Wind" },
  ];
  const rows = buildImportPreview(
    [
      { taxon_id: "gbif:1", display_name: "Cane toad" },
      { taxon_id: "local:rhinella_marina", display_name: "RHINELLA MARINA" },
      localLabel("Rain"),
      localLabel("rain"),
      { taxon_id: "local:other", display_name: "Rain" },
    ],
    existing,
  );
  assert.deepEqual(
    rows.map((r) => r.status),
    ["existing", "existing", "new", "duplicate", "duplicate"],
  );
  assert.deepEqual(rows.map((r) => r.source), ["GBIF", "Local", "Local", "Local", "Local"]);
});

test("preview: underscore vs space is new but flagged similar", () => {
  const rows = buildImportPreview(
    [{ taxon_id: "local:adenomera_andreae", display_name: "Adenomera_andreae" }],
    [{ taxon_id: "gbif:42", display_name: "Adenomera andreae" }],
  );
  assert.equal(rows[0].status, "new");
  assert.equal(rows[0].similarTo, "Adenomera andreae");
});
