// Run with `npm test` (node's built-in runner; node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SPECTROGRAM_PREFS,
  applyPrefsToDatasetRange,
  customAnalysisOf,
  isDefaultSpectrogramPrefs,
  sanitizeSpectrogramPrefs,
  spectrogramPrefsKey,
} from "../src/utils/spectrogramPrefs.ts";

test("defaults are recognised and anything unusable falls back to them", () => {
  assert.ok(isDefaultSpectrogramPrefs(DEFAULT_SPECTROGRAM_PREFS));
  for (const junk of [null, undefined, 42, "x", [], {}]) {
    assert.ok(isDefaultSpectrogramPrefs(sanitizeSpectrogramPrefs(junk)));
  }
});

test("sanitize clamps contrast, rejects unknown colours/windows, keeps valid values", () => {
  const p = sanitizeSpectrogramPrefs({
    fMinHz: 500,
    fMaxHz: 8000,
    rangeDb: 500,
    colormap: "nope",
    windowMs: 33,
  });
  assert.equal(p.rangeDb, 120);
  assert.equal(p.colormap, "viridis");
  assert.equal(p.windowMs, 25);
  assert.equal(p.fMinHz, 500);
  assert.equal(p.fMaxHz, 8000);

  const ok = sanitizeSpectrogramPrefs({
    colormap: "greys",
    windowMs: 50,
    rangeDb: 60.4,
  });
  assert.equal(ok.colormap, "greys");
  assert.equal(ok.windowMs, 50);
  assert.equal(ok.rangeDb, 60);

  // 100 ms was removed (too slow to draw); a stale saved value falls back.
  assert.equal(sanitizeSpectrogramPrefs({ windowMs: 100 }).windowMs, 25);
});

test("a frequency range is all-or-nothing and must have min < max", () => {
  for (const bad of [
    { fMinHz: 5000, fMaxHz: 1000 },
    { fMinHz: 1000, fMaxHz: 1000 },
    { fMinHz: 1000, fMaxHz: null },
    { fMinHz: null, fMaxHz: 8000 },
    { fMinHz: -1, fMaxHz: 8000 },
  ]) {
    const p = sanitizeSpectrogramPrefs(bad);
    assert.equal(p.fMinHz, null);
    assert.equal(p.fMaxHz, null);
  }
});

test("default prefs leave the dataset range untouched (same object)", () => {
  const dataset = { spectrogram_f_min_hz: 0, spectrogram_f_max_hz: 11000 };
  assert.equal(
    applyPrefsToDatasetRange(dataset, DEFAULT_SPECTROGRAM_PREFS),
    dataset,
  );
  assert.equal(applyPrefsToDatasetRange(null, DEFAULT_SPECTROGRAM_PREFS), null);
  assert.equal(
    applyPrefsToDatasetRange(undefined, DEFAULT_SPECTROGRAM_PREFS),
    undefined,
  );
});

test("a custom range overrides the dataset range", () => {
  const dataset = { spectrogram_f_min_hz: 0, spectrogram_f_max_hz: 11000 };
  const prefs = { ...DEFAULT_SPECTROGRAM_PREFS, fMinHz: 1000, fMaxHz: 6000 };
  assert.deepEqual(applyPrefsToDatasetRange(dataset, prefs), {
    spectrogram_f_min_hz: 1000,
    spectrogram_f_max_hz: 6000,
  });
});

test("the key changes exactly when the picture would", () => {
  const a = spectrogramPrefsKey(DEFAULT_SPECTROGRAM_PREFS);
  assert.equal(a, spectrogramPrefsKey({ ...DEFAULT_SPECTROGRAM_PREFS }));
  assert.notEqual(
    a,
    spectrogramPrefsKey({ ...DEFAULT_SPECTROGRAM_PREFS, colormap: "magma" }),
  );
  assert.notEqual(
    a,
    spectrogramPrefsKey({ ...DEFAULT_SPECTROGRAM_PREFS, rangeDb: 60 }),
  );
  assert.notEqual(
    a,
    spectrogramPrefsKey({ ...DEFAULT_SPECTROGRAM_PREFS, windowMs: 50 }),
  );
  assert.notEqual(
    a,
    spectrogramPrefsKey({ ...DEFAULT_SPECTROGRAM_PREFS, zeroPad: 2 }),
  );
});

test("the extra colour schemes are accepted", () => {
  for (const id of ["hot", "jet", "bone"]) {
    assert.equal(sanitizeSpectrogramPrefs({ colormap: id }).colormap, id);
  }
});

test("scale, window type, gain and high boost are validated and clamped", () => {
  const p = sanitizeSpectrogramPrefs({
    scale: "linear",
    windowType: "blackman",
    gainDb: 12.4,
    highBoostDb: 15,
  });
  assert.equal(p.scale, "linear");
  assert.equal(p.windowType, "blackman");
  assert.equal(p.gainDb, 12);
  assert.equal(p.highBoostDb, 15);

  const bad = sanitizeSpectrogramPrefs({
    scale: "cubic",
    windowType: "kaiser",
    gainDb: 999,
    highBoostDb: -5,
  });
  assert.equal(bad.scale, "mel");
  assert.equal(bad.windowType, "hann");
  assert.equal(bad.gainDb, 30);
  assert.equal(bad.highBoostDb, 0);
  assert.equal(sanitizeSpectrogramPrefs({ gainDb: -99 }).gainDb, -30);
});

test("zero padding: only the offered values survive, anything else is 1x", () => {
  assert.equal(DEFAULT_SPECTROGRAM_PREFS.zeroPad, 1);
  assert.equal(sanitizeSpectrogramPrefs({ zeroPad: 2 }).zeroPad, 2);
  assert.equal(sanitizeSpectrogramPrefs({ zeroPad: 4 }).zeroPad, 4);
  for (const bad of [0, 3, 8, -1, "2", null, undefined]) {
    assert.equal(sanitizeSpectrogramPrefs({ zeroPad: bad }).zeroPad, 1);
  }
  assert.ok(
    !isDefaultSpectrogramPrefs({ ...DEFAULT_SPECTROGRAM_PREFS, zeroPad: 2 }),
  );
});

test("our own spectrogram is only used when one of those options is set", () => {
  assert.equal(customAnalysisOf(DEFAULT_SPECTROGRAM_PREFS), null);
  // Zero padding, colour, contrast, window size and range stay with the player.
  assert.equal(
    customAnalysisOf({
      ...DEFAULT_SPECTROGRAM_PREFS,
      zeroPad: 2,
      colormap: "jet",
      rangeDb: 60,
      windowMs: 50,
      fMinHz: 100,
      fMaxHz: 5000,
    }),
    null,
  );
  for (const change of [
    { scale: "linear" as const },
    { windowType: "hamming" as const },
    { gainDb: 6 },
    { highBoostDb: 10 },
  ]) {
    const a = customAnalysisOf({ ...DEFAULT_SPECTROGRAM_PREFS, ...change });
    assert.ok(a, JSON.stringify(change));
  }
});

test("the key changes when the new options do", () => {
  const a = spectrogramPrefsKey(DEFAULT_SPECTROGRAM_PREFS);
  for (const change of [
    { scale: "log" as const },
    { windowType: "blackman" as const },
    { gainDb: 3 },
    { highBoostDb: 3 },
  ]) {
    assert.notEqual(
      a,
      spectrogramPrefsKey({ ...DEFAULT_SPECTROGRAM_PREFS, ...change }),
    );
    assert.ok(
      !isDefaultSpectrogramPrefs({ ...DEFAULT_SPECTROGRAM_PREFS, ...change }),
    );
  }
});
