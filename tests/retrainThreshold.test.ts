// Run with `npm test` (node's built-in runner; node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canResetThreshold,
  formatThreshold,
  initialThreshold,
  parseThreshold,
  thresholdToSave,
} from "../src/utils/retrainThreshold.ts";

test("the default number is labelled, any other number is plain", () => {
  assert.equal(formatThreshold(10, 10, false, ""), "10 (default)");
  assert.equal(formatThreshold(3, 10, false, ""), "3");
  assert.equal(formatThreshold(11, 10, false, ""), "11");
});

test("nothing is labelled while typing, or when the default is unknown", () => {
  assert.equal(formatThreshold(10, 10, true, "10"), "10");
  assert.equal(formatThreshold(1, 10, true, "1"), "1");
  assert.equal(formatThreshold(10, null, false, ""), "10");
});

test("an empty box stays empty", () => {
  assert.equal(formatThreshold(undefined, 10, false, ""), "");
  assert.equal(formatThreshold("", 10, false, ""), "");
});

test("the label is ignored when the text is read back", () => {
  assert.equal(parseThreshold("10 (default)"), "10");
  assert.equal(parseThreshold("10  (Default) "), "10");
  assert.equal(parseThreshold("3"), "3");
  assert.equal(parseThreshold(""), "");
  assert.equal(parseThreshold(undefined), "");
});

test("the default number is saved as null, other numbers as they are", () => {
  assert.equal(thresholdToSave(10, 10), null);
  assert.equal(thresholdToSave(3, 10), 3);
  assert.equal(thresholdToSave(null, 10), null);
  assert.equal(thresholdToSave(undefined, 10), null);
  assert.equal(thresholdToSave(10, null), 10); // default unknown: keep the number
});

test("the window opens on the dataset's value, else on the default", () => {
  assert.equal(initialThreshold(3, 10), 3);
  assert.equal(initialThreshold(null, 10), 10);
  assert.equal(initialThreshold(undefined, null), undefined);
});

test("the reset link shows only when the number is not the default", () => {
  assert.equal(canResetThreshold(3, 10), true);
  assert.equal(canResetThreshold(10, 10), false);
  assert.equal(canResetThreshold(null, 10), false);
  assert.equal(canResetThreshold(undefined, 10), false);
  assert.equal(canResetThreshold(5, null), true); // default unknown
  assert.equal(canResetThreshold(undefined, null), true);
});
