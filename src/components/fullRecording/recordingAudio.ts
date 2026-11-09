import { snippetApi } from "../../services/api";
import type { Snippet } from "../../types";

/**
 * Rebuilds a whole recording's audio in the browser.
 *
 * The backend has no "full recording" audio route, but it does list every
 * snippet of a recording (with start/end times) and serves each snippet's
 * audio. Placing those snippets back at their start times gives the full
 * recording, made of the same audio the snippet cards play (same mono mix,
 * same sample rate).
 *
 * This is the ONLY place that knows how the audio is obtained. If the backend
 * ever gains a real route, only `loadFullRecordingAudio` needs to change.
 */

/** Longest recording the full view will rebuild (seconds). */
export const FULL_RECORDING_MAX_SEC = 300;

const PAGE_SIZE = 200;
const DOWNLOAD_CONCURRENCY = 4;
/** Gaps shorter than this are rounding between neighbouring snippets. */
const GAP_TOLERANCE_SEC = 0.05;

export class FullRecordingTooLongError extends Error {
  durationSec: number;
  constructor(durationSec: number) {
    super("Recording is too long for the full view");
    this.name = "FullRecordingTooLongError";
    this.durationSec = durationSec;
  }
}

export interface FullRecordingGap {
  startSec: number;
  endSec: number;
}

export interface FullRecordingWindow {
  id: number;
  startSec: number;
  endSec: number;
}

export interface FullRecordingAudio {
  /** Blob URL of a mono WAV; revoke when done. */
  url: string;
  sampleRate: number;
  durationSec: number;
  /** Stretches no snippet covers (played/drawn as silence). */
  gaps: FullRecordingGap[];
  /** Where each snippet of the recording sits in it (for highlighting). */
  windows: FullRecordingWindow[];
}

export interface LoadFullRecordingParams {
  datasetId: number;
  snippetSetId: number;
  recordingId: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error &&
      (err.name === "CanceledError" || err.name === "AbortError"))
  );
}

/** 16-bit PCM mono WAV. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function findGaps(
  covered: Array<{ start: number; end: number }>,
  durationSec: number,
): FullRecordingGap[] {
  const sorted = [...covered].sort((a, b) => a.start - b.start);
  const gaps: FullRecordingGap[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.start - cursor > GAP_TOLERANCE_SEC) {
      gaps.push({ startSec: cursor, endSec: c.start });
    }
    cursor = Math.max(cursor, c.end);
  }
  if (durationSec - cursor > GAP_TOLERANCE_SEC) {
    gaps.push({ startSec: cursor, endSec: durationSec });
  }
  return gaps;
}

export async function loadFullRecordingAudio({
  datasetId,
  snippetSetId,
  recordingId,
  signal,
  onProgress,
}: LoadFullRecordingParams): Promise<FullRecordingAudio> {
  // 1. Every snippet of this recording (paged).
  const snippets: Snippet[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    throwIfAborted(signal);
    const page = await snippetApi.getAll({
      dataset_id: datasetId,
      snippet_set_id: snippetSetId,
      recording_id: recordingId,
      skip,
      limit: PAGE_SIZE,
    });
    snippets.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  if (snippets.length === 0)
    throw new Error("No snippets found for this recording");
  snippets.sort((a, b) => a.start_time - b.start_time);

  const durationSec = Math.max(...snippets.map((s) => s.end_time));
  if (durationSec > FULL_RECORDING_MAX_SEC) {
    throw new FullRecordingTooLongError(durationSec);
  }

  // 2. Download + decode each snippet and place it at its start time.
  const total = snippets.length;
  let done = 0;
  onProgress?.(0, total);

  let ctx: AudioContext | null = null;
  let out: Float32Array | null = null;
  let sampleRate = 0;
  const covered: Array<{ start: number; end: number }> = [];

  const fetchSamples = async (snippetId: number) => {
    const audio = await snippetApi.getSnippetAudio(snippetId, signal);
    try {
      const bytes = await (await fetch(audio.url)).arrayBuffer();
      return { bytes, sampleRate: audio.sampleRate };
    } finally {
      URL.revokeObjectURL(audio.url);
    }
  };

  const place = async (index: number, bytes: ArrayBuffer) => {
    const snippet = snippets[index];
    const decoded = await ctx!.decodeAudioData(bytes);
    const samples = decoded.getChannelData(0);
    const offset = Math.round(snippet.start_time * sampleRate);
    const room = Math.max(0, out!.length - offset);
    out!.set(samples.subarray(0, Math.min(samples.length, room)), offset);
    covered.push({
      start: snippet.start_time,
      end: snippet.start_time + samples.length / sampleRate,
    });
    done += 1;
    onProgress?.(done, total);
  };

  try {
    // The first snippet fixes the sample rate (and so the buffer size).
    const first = await fetchSamples(snippets[0].id);
    throwIfAborted(signal);
    sampleRate = first.sampleRate;
    ctx = new AudioContext({ sampleRate });
    out = new Float32Array(Math.ceil(durationSec * sampleRate));
    await place(0, first.bytes);

    let next = 1;
    const worker = async () => {
      while (next < snippets.length) {
        throwIfAborted(signal);
        const index = next++;
        const { bytes } = await fetchSamples(snippets[index].id);
        throwIfAborted(signal);
        await place(index, bytes);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(DOWNLOAD_CONCURRENCY, snippets.length - 1) },
        worker,
      ),
    );
  } finally {
    void ctx?.close().catch(() => {});
  }
  throwIfAborted(signal);

  const wav = encodeWav(out!, sampleRate);
  return {
    url: URL.createObjectURL(new Blob([wav], { type: "audio/wav" })),
    sampleRate,
    durationSec,
    gaps: findGaps(covered, durationSec),
    windows: snippets.map((s) => ({
      id: s.id,
      startSec: s.start_time,
      endSec: s.end_time,
    })),
  };
}
