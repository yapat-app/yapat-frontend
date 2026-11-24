// Run with `npm test` (node's built-in runner; node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computingEmbeddingsLabel,
  dedupeEmbeddingOptions,
  embeddingMethodBlockedReason,
  embeddingOptionLabel,
  embeddingStartNote,
  groupEmbeddingOptions,
  noEmbeddingModelsLeft,
  pickEmbeddingOption,
  readyEmbeddingModelCount,
} from "../src/utils/embeddingOptions.ts";
import type { EmbeddingMethod, EmbeddingOption } from "../src/types/index.ts";

const option = (id: number, over: Partial<EmbeddingOption> = {}): EmbeddingOption => ({
  embedding_model_id: id,
  name: "birdnet",
  version: `v${id}`,
  dim: 1024,
  snippet_set_id: 10,
  window_size: 3,
  step_size: 3,
  overlap: 0,
  embedding_job_id: 100 + id,
  status: "completed",
  is_default: false,
  shares_snippet_set: false,
  active_checkpoint_id: null,
  model_family_name: `family_${id}`,
  ...over,
});

const method = (id: number, window: number): EmbeddingMethod =>
  ({ id, name: "m", version: "1", window_size: window, step_size: window, overlap: 0 }) as EmbeddingMethod;

test("the saved model wins while it is still completed", () => {
  const options = [option(1, { is_default: true }), option(2)];
  assert.equal(pickEmbeddingOption(options, 2)?.embedding_model_id, 2);
});

test("a saved model that can't be selected falls back to the default", () => {
  const options = [
    option(1, { is_default: true }),
    option(2, { status: "running" }),
    option(3, { status: "failed" }),
  ];
  assert.equal(pickEmbeddingOption(options, 2)?.embedding_model_id, 1);
  assert.equal(pickEmbeddingOption(options, 3)?.embedding_model_id, 1);
  assert.equal(pickEmbeddingOption(options, 99)?.embedding_model_id, 1);
  assert.equal(pickEmbeddingOption(options, null)?.embedding_model_id, 1);
});

test("nothing is selected until a model has finished", () => {
  assert.equal(pickEmbeddingOption([option(1, { status: "pending" })], 1), null);
  assert.equal(pickEmbeddingOption([], null), null);
});

test("a model with jobs on two sets is listed once, on the set the dataset uses", () => {
  const onDefault = option(1, { snippet_set_id: 10, is_default: true });
  const onOther = option(1, { snippet_set_id: 11 });
  assert.deepEqual(dedupeEmbeddingOptions([onDefault, onOther]), [onDefault]);
  assert.deepEqual(dedupeEmbeddingOptions([onOther, onDefault]), [onDefault]);
});

test("a re-run prefers the latest finished job over a failed one", () => {
  const done = option(1, { snippet_set_id: 10 });
  const failed = option(1, { snippet_set_id: 11, status: "failed" });
  assert.deepEqual(dedupeEmbeddingOptions([done, failed]), [done]);
  assert.deepEqual(dedupeEmbeddingOptions([failed, done]), [done]);
});

test("the label shows name, version and snippet length", () => {
  assert.equal(
    embeddingOptionLabel(option(1, { version: "3.0-preview3.1", window_size: 5 })),
    "birdnet 3.0-preview3.1 · 5 s",
  );
});

test("same settings share snippets; other settings create new snippets", () => {
  const options = [option(1, { version: "2.4" })];
  assert.equal(
    embeddingStartNote(method(2, 3), options),
    "Shares snippets and labels with birdnet 2.4",
  );
  assert.equal(
    embeddingStartNote(method(3, 5), options),
    "Creates new snippets with separate labels",
  );
});

test("no note for a dataset's first model, and failed jobs don't count", () => {
  assert.equal(embeddingStartNote(method(2, 3), []), null);
  assert.equal(embeddingStartNote(method(2, 3), [option(1, { status: "failed" })]), null);
});

test("a model already on the dataset says why it can't be started", () => {
  const blocked = (status: EmbeddingOption["status"]) =>
    embeddingMethodBlockedReason(method(1, 3), [option(1, { status })]);
  assert.equal(blocked("completed"), "Embeddings generated");
  assert.equal(blocked("running"), "Generating embeddings");
  assert.equal(blocked("pending"), "Generating embeddings");
  assert.equal(blocked("failed"), "Embedding failed");
});

test("a finished job wins over a failed re-run of the same model", () => {
  const options = [option(1), option(1, { snippet_set_id: 11, status: "failed" })];
  assert.equal(embeddingMethodBlockedReason(method(1, 3), options), "Embeddings generated");
});

test("a model not on the dataset can start unless its weights are missing", () => {
  assert.equal(embeddingMethodBlockedReason(method(2, 3), [option(1)]), null);
  assert.equal(
    embeddingMethodBlockedReason({ ...method(2, 3), weights_available: false }, [option(1)]),
    "Not available on this server",
  );
});

test("progress names the job's model, and no model until it is known", () => {
  assert.equal(
    computingEmbeddingsLabel(option(3, { name: "perch", version: "2.0" })),
    "Computing perch 2.0 embeddings",
  );
  assert.equal(computingEmbeddingsLabel(null), "Computing embeddings");
});

test("nothing is left to generate only when every model is blocked", () => {
  const methods = [method(1, 3), method(2, 3)];
  assert.equal(noEmbeddingModelsLeft(methods, [option(1)]), false);
  assert.equal(noEmbeddingModelsLeft(methods, [option(1), option(2, { status: "failed" })]), true);
  assert.equal(noEmbeddingModelsLeft([], []), false);
});

test("only finished models count as ready", () => {
  const options = [option(1), option(2, { status: "running" }), option(3, { status: "failed" })];
  assert.equal(readyEmbeddingModelCount(options), 1);
});

test("models are grouped by snippet set with the default first", () => {
  const groups = groupEmbeddingOptions([
    option(3, { snippet_set_id: 47 }),
    option(2, { snippet_set_id: 37 }),
    option(1, { snippet_set_id: 37, is_default: true }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.snippetSetId, g.shared, g.options.map((o) => o.embedding_model_id)]),
    [
      [37, true, [1, 2]],
      [47, false, [3]],
    ],
  );
});
