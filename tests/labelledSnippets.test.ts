import test from "node:test";
import assert from "node:assert/strict";
import { countLabelled, labelledIds } from "../src/utils/labelledSnippets.ts";

test("a snippet with at least one label is labelled", () => {
  const set = labelledIds([
    { snippet_id: 1, labels: ["a"] },
    { snippet_id: 2, labels: [] },
    { snippet_id: 3, labels: ["a", "b"] },
    { snippet_id: 4 },
    { snippet_id: 5, labels: null },
  ]);
  assert.deepEqual([...set].sort(), [1, 3]);
});

test("countLabelled counts only the ids asked about", () => {
  const set = new Set([1, 3, 9]);
  assert.equal(countLabelled([1, 2, 3, 4], set), 2);
  assert.equal(countLabelled([], set), 0);
});
