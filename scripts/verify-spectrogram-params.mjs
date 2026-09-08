/**
 * Verifies spectrogramParamsForSampleRate() against the REAL rust-melspec-wasm
 * binary that react-audio-spectrogram-player calls.
 *
 * The Rust side asserts:  n_fft >= win_length >= hop_length,  n_fft a power of 2.
 * Violations compile to `unreachable` in release wasm -> "RuntimeError: unreachable"
 * with no message, which is the bug this test pins down.
 *
 * Run: npm run verify:spectrogram
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  initSync,
  mel_spectrogram_db,
} from "../node_modules/rust-melspec-wasm/rust_melspec_wasm.js";
import * as cfg from "../src/utils/spectrogramConfig.ts";

const here = dirname(fileURLToPath(import.meta.url));
const { spectrogramParamsForSampleRate, minSamplesForSpectrogram } = cfg;

initSync({
  module: readFileSync(
    resolve(here, "../node_modules/rust-melspec-wasm/rust_melspec_wasm_bg.wasm"),
  ),
});

// Every sample rate we could plausibly meet, plus the boundaries around the
// old 102_400 Hz cliff and some non-round ultrasonic rates.
const RATES = [
  8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 102399,
  102400, 102401, 125000, 128000, 176400, 192000, 250000, 256000, 300000,
  384000, 500000, 768000,
];

const SNIPPET_SEC = 3;
let failures = 0;

function check(cond, label) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${label}`);
  }
  return cond;
}

console.log("sample rate |  n_fft   win    hop | frames | result");
console.log("------------+---------------------+--------+-------");

for (const sr of RATES) {
  const p = spectrogramParamsForSampleRate(sr);

  const okPow2 = check(
    Number.isInteger(Math.log2(p.n_fft)),
    `sr=${sr}: n_fft=${p.n_fft} is not a power of 2`,
  );
  const okFft = check(
    p.n_fft >= p.win_length,
    `sr=${sr}: n_fft=${p.n_fft} < win_length=${p.win_length}`,
  );
  const okHop = check(
    p.win_length >= p.hop_length,
    `sr=${sr}: win_length=${p.win_length} < hop_length=${p.hop_length}`,
  );
  const okMels = check(
    p.n_mels <= p.n_fft,
    `sr=${sr}: n_mels=${p.n_mels} > n_fft=${p.n_fft}`,
  );

  // The real thing: does the wasm actually survive these params?
  const wave = new Float32Array(Math.round(sr * SNIPPET_SEC));
  for (let i = 0; i < wave.length; i++) wave[i] = Math.sin(i / 20) * 0.3;

  let frames = "-";
  let result = "ok";
  try {
    const out = mel_spectrogram_db(
      sr,
      wave,
      p.n_fft,
      p.win_length,
      p.hop_length,
      0,
      sr / 2,
      p.n_mels,
      80,
    );
    frames = out.length;
    check(
      out.length > 0 && out[0].length === p.n_mels,
      `sr=${sr}: unexpected output shape ${out.length}x${out[0]?.length}`,
    );
  } catch (e) {
    failures++;
    result = `TRAP ${e.message}`;
  }

  const flags = [okPow2 && okFft && okHop && okMels ? "" : " <-- invariant"].join("");
  console.log(
    `${String(sr).padStart(11)} | ${String(p.n_fft).padStart(6)} ${String(p.win_length).padStart(5)} ${String(p.hop_length).padStart(5)} | ${String(frames).padStart(6)} | ${result}${flags}`,
  );
}

// Datasets that rendered before the fix must render IDENTICALLY after it —
// nothing about the running user study may shift. Compare against the exact
// pre-fix formula for every rate where it was valid.
console.log("\nno-regression for rates that already worked:");
const preFix = (sr) => ({
  n_fft: 1024,
  win_length: Math.min(1024, Math.max(400, Math.round(sr * 0.025))),
  hop_length: Math.max(160, Math.round(sr * 0.01)),
  n_mels: 128,
});
for (const sr of RATES) {
  const old = preFix(sr);
  if (old.win_length < old.hop_length) continue; // pre-fix code trapped here
  const now = spectrogramParamsForSampleRate(sr);
  const same =
    old.n_fft === now.n_fft &&
    old.win_length === now.win_length &&
    old.hop_length === now.hop_length &&
    old.n_mels === now.n_mels;
  check(
    same,
    `sr=${sr}: params changed for a rate that already worked — ` +
      `was ${old.n_fft}/${old.win_length}/${old.hop_length}, ` +
      `now ${now.n_fft}/${now.win_length}/${now.hop_length}`,
  );
  if (same) console.log(`  sr=${String(sr).padStart(6)}: unchanged (${now.n_fft}/${now.win_length}/${now.hop_length})`);
}

// Window count should stay bounded — that is the whole point of scaling n_fft
// with the sample rate rather than just clamping the hop.
console.log("\nwindow-count bound (3 s snippet):");
const frameCounts = RATES.map(
  (sr) =>
    Math.round(sr * SNIPPET_SEC) / spectrogramParamsForSampleRate(sr).hop_length,
);
const maxFrames = Math.max(...frameCounts);
console.log(`  max frames across all rates: ${Math.round(maxFrames)}`);
check(maxFrames <= 400, `window count ${Math.round(maxFrames)} exceeds 400`);

// Short-clip guard: clips below the wasm's minimum must be reported, not trapped.
console.log("\nshort-clip guard:");
if (typeof minSamplesForSpectrogram !== "function") {
  failures++;
  console.log("  FAIL: minSamplesForSpectrogram() is not exported");
}
for (const sr of typeof minSamplesForSpectrogram === "function" ? [16000, 192000] : []) {
  const p = spectrogramParamsForSampleRate(sr);
  const min = minSamplesForSpectrogram(p);
  for (const [n, shouldWork] of [
    [min - 1, false],
    [min, true],
  ]) {
    let trapped = false;
    try {
      mel_spectrogram_db(sr, new Float32Array(n).fill(0.1), p.n_fft, p.win_length, p.hop_length, 0, sr / 2, p.n_mels, 80);
    } catch {
      trapped = true;
    }
    const label = `sr=${sr} len=${n} (min=${min})`;
    if (shouldWork) {
      check(!trapped, `${label}: expected OK at the declared minimum, but it trapped`);
      console.log(`  ${label}: ${trapped ? "TRAP" : "ok"} (expected ok)`);
    } else {
      console.log(`  ${label}: ${trapped ? "TRAP" : "ok"} (below minimum — guard must skip these)`);
    }
  }
}

console.log(
  failures === 0 ? "\nPASS — all invariants hold and no wasm traps" : `\nFAIL — ${failures} problem(s)`,
);
process.exit(failures === 0 ? 0 : 1);
