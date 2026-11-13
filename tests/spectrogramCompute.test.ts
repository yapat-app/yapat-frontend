// Run with `npm test` (node's built-in runner; node strips the TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSpectrogram,
  frequencyRows,
  makeFft,
  windowFunction,
  type ComputeOptions,
} from "../src/utils/spectrogramCompute.ts";

const SR = 16000;

function sine(freq: number, seconds: number, amp = 1, sr = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

function mix(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts[0].length);
  for (const p of parts) for (let i = 0; i < out.length; i++) out[i] += p[i];
  return out;
}

const base: ComputeOptions = {
  sampleRate: SR,
  nFft: 1024,
  winLength: 400,
  hopLength: 160,
  windowType: "hann",
  scale: "linear",
  fMin: 0,
  fMax: 8000,
  rows: 128,
  gainDb: 0,
  highBoostDb: 0,
  rangeDb: 200,
};

/** Row (0 = lowest frequency) holding the loudest value in the middle column. */
function peakRow(sxx: number[][]): number {
  const col = Math.floor(sxx[0].length / 2);
  let best = 0;
  for (let r = 1; r < sxx.length; r++) if (sxx[r][col] > sxx[best][col]) best = r;
  return best;
}

function levelAt(sxx: number[][], opts: ComputeOptions, hz: number): number {
  const centres = frequencyRows(opts.scale, opts.fMin, opts.fMax, sxx.length);
  let r = 0;
  for (let i = 1; i < centres.length; i++)
    if (Math.abs(centres[i] - hz) < Math.abs(centres[r] - hz)) r = i;
  return sxx[r][Math.floor(sxx[0].length / 2)];
}

test("the FFT puts a pure tone in the right bin", () => {
  const n = 256;
  const fft = makeFft(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 10 * i) / n);
  fft(re, im);
  const mag = Array.from(re, (v, i) => Math.hypot(v, im[i]));
  const peak = mag.indexOf(Math.max(...mag.slice(0, n / 2)));
  assert.equal(peak, 10);
  assert.ok(mag[10] > 100 * mag[40]);
});

test("window functions have the expected shape", () => {
  const n = 64;
  const hann = windowFunction("hann", n);
  const hamming = windowFunction("hamming", n);
  const blackman = windowFunction("blackman", n);
  assert.ok(Math.abs(hann[0]) < 1e-12);
  assert.ok(Math.abs(hann[n / 2] - 1) < 1e-12);
  assert.ok(Math.abs(hamming[0] - 0.08) < 1e-12);
  assert.ok(Math.abs(blackman[0]) < 1e-12);
  assert.ok(Math.abs(blackman[n / 2] - 1) < 1e-12);
});

test("output is rows x columns, lowest frequency first", async () => {
  const sxx = (await computeSpectrogram(sine(1000, 1), base))!;
  assert.equal(sxx.length, 128);
  assert.equal(sxx[0].length, 1 + Math.floor(SR / 160));
  assert.ok(Array.isArray(sxx[0]), "the player needs plain arrays");

  const low = (await computeSpectrogram(sine(500, 1), base))!;
  const high = (await computeSpectrogram(sine(6000, 1), base))!;
  assert.ok(peakRow(low) < peakRow(high));
});

test("a full-scale tone reads about 0 dB at the right frequency (linear)", async () => {
  const sxx = (await computeSpectrogram(sine(1000, 1), base))!;
  const centres = frequencyRows("linear", 0, 8000, 128);
  const peakHz = centres[peakRow(sxx)];
  assert.ok(Math.abs(peakHz - 1000) < 80, `peak at ${peakHz} Hz`);
  // With gain 0 the clamp ceiling is the loudest level itself, so the biggest
  // value is that level: a full-scale sine should read close to 0 dB.
  const loudest = Math.max(...sxx.map((r) => Math.max(...r)));
  assert.ok(loudest > -6 && loudest < 0.5, `loudest ${loudest} dB`);
});

test("mel, linear and log place the same tone at their own rows", async () => {
  const tone = sine(1000, 1);
  for (const scale of ["mel", "linear", "log"] as const) {
    const o = { ...base, scale };
    const sxx = (await computeSpectrogram(tone, o))!;
    const centres = frequencyRows(scale, 0, 8000, sxx.length);
    const peakHz = centres[peakRow(sxx)];
    assert.ok(
      Math.abs(peakHz - 1000) / 1000 < 0.15,
      `${scale}: peak at ${peakHz} Hz`,
    );
  }
  // 1 kHz sits much higher up a mel axis than a linear one.
  const mel = (await computeSpectrogram(tone, { ...base, scale: "mel" }))!;
  const lin = (await computeSpectrogram(tone, { ...base, scale: "linear" }))!;
  assert.ok(peakRow(mel) > peakRow(lin) * 2);
});

test("rows are evenly spaced on their scale", () => {
  const log = frequencyRows("log", 0, 8000, 5);
  assert.ok(Math.abs(log[0] - 20) < 1e-9);
  assert.ok(Math.abs(log[4] - 8000) < 1e-6);
  const r = log.slice(1).map((v, i) => v / log[i]);
  for (const x of r) assert.ok(Math.abs(x - r[0]) < 1e-9);
  const lin = frequencyRows("linear", 0, 8000, 5);
  assert.deepEqual(lin, [0, 2000, 4000, 6000, 8000]);
});

test("gain moves the brightest level down by exactly that much", async () => {
  const tone = sine(1000, 1);
  const a = (await computeSpectrogram(tone, { ...base, gainDb: 0 }))!;
  const b = (await computeSpectrogram(tone, { ...base, gainDb: 10 }))!;
  const ceil = (s: number[][]) => Math.max(...s.map((r) => Math.max(...r)));
  assert.ok(Math.abs(ceil(a) - ceil(b) - 10) < 1e-9);
});

test("range clips everything below it", async () => {
  const noisy = mix(sine(1000, 1), sine(3000, 1, 0.001));
  const sxx = (await computeSpectrogram(noisy, { ...base, rangeDb: 30 }))!;
  const all = sxx.flat();
  assert.ok(Math.max(...all) - Math.min(...all) <= 30 + 1e-9);
});

test("high boost lifts high tones relative to low ones, by dB per decade", async () => {
  const both = mix(sine(500, 1, 0.5), sine(4000, 1, 0.5));
  const flat = (await computeSpectrogram(both, { ...base, highBoostDb: 0 }))!;
  const tilt = (await computeSpectrogram(both, { ...base, highBoostDb: 20 }))!;
  const diff = (s: number[][]) =>
    levelAt(s, base, 4000) - levelAt(s, base, 500);
  const gained = diff(tilt) - diff(flat);
  // 20 dB/decade over a factor of 8 in frequency = 20 * log10(8) = 18 dB.
  assert.ok(Math.abs(gained - 18) < 2, `gained ${gained} dB`);
});

test("window type changes the picture; zero padding does not move the peak", async () => {
  const tone = sine(1000, 1);
  const hann = (await computeSpectrogram(tone, base))!;
  const black = (await computeSpectrogram(tone, { ...base, windowType: "blackman" }))!;
  assert.notDeepEqual(hann[40], black[40]);
  const padded = (await computeSpectrogram(tone, { ...base, nFft: 4096 }))!;
  assert.ok(Math.abs(peakRow(padded) - peakRow(hann)) <= 1);
});

test("too little audio, or a cancel, gives nothing", async () => {
  assert.equal(await computeSpectrogram(new Float32Array(1), base), null);
  const long = sine(1000, 5);
  assert.equal(await computeSpectrogram(long, base, () => true), null);
});

test("a long recording is capped, not run at full size", async () => {
  const sxx = (await computeSpectrogram(sine(1000, 120), base))!;
  assert.ok(sxx[0].length <= 6001);
  assert.ok(sxx.length * sxx[0].length <= 4_000_000);
});
