/**
 * useAudioInstrumentation — capture play/pause/seek/volume on the internal <audio>
 * element rendered by react-audio-spectrogram-player (which exposes no callbacks).
 *
 * Media events don't bubble, so we listen on `document` in the capture phase. The
 * listeners are installed once globally (ref-counted) even though several
 * SnippetSpectrogramPlayer instances may mount this hook. snippetId is resolved
 * centrally from al.activeSnippetId at log time (the active card owns the player).
 *
 * Navigator/timeframe zoom is intentionally NOT captured — the library exposes no
 * event for it and DOM-watching would be brittle (see plan: deferred).
 */

import { useEffect } from "react";
import { studyLogger } from "./StudyLogger";

interface PlayState {
  playStartTs: number | null;
  playStartPosMs: number;
  lastPosMs: number;
}

let refCount = 0;
let installed = false;
const states = new WeakMap<HTMLAudioElement, PlayState>();

function stateFor(el: HTMLAudioElement): PlayState {
  let s = states.get(el);
  if (!s) {
    s = { playStartTs: null, playStartPosMs: 0, lastPosMs: 0 };
    states.set(el, s);
  }
  return s;
}

function posMs(el: HTMLAudioElement): number {
  return Math.round((el.currentTime || 0) * 1000);
}

function closeSegment(el: HTMLAudioElement, s: PlayState): void {
  if (s.playStartTs == null) return;
  const toMs = posMs(el);
  studyLogger.log("audio_play_segment", { fromMs: s.playStartPosMs, toMs }, {
    durationMs: Math.round(performance.now() - s.playStartTs),
  });
  s.playStartTs = null;
}

function onAudioEvent(e: Event): void {
  const el = e.target;
  if (!(el instanceof HTMLAudioElement)) return;
  const s = stateFor(el);

  switch (e.type) {
    case "play": {
      s.playStartTs = performance.now();
      s.playStartPosMs = posMs(el);
      break;
    }
    case "pause":
    case "ended": {
      closeSegment(el, s);
      s.lastPosMs = posMs(el);
      break;
    }
    case "seeked": {
      const toMs = posMs(el);
      studyLogger.log("audio_seek", { fromMs: s.lastPosMs, toMs });
      // A seek mid-playback ends the current segment and starts a new one.
      if (s.playStartTs != null) {
        closeSegment(el, s);
        s.playStartTs = performance.now();
        s.playStartPosMs = toMs;
      }
      s.lastPosMs = toMs;
      break;
    }
    case "volumechange": {
      studyLogger.log("audio_volume_change", { volume: Number(el.volume.toFixed(3)) });
      break;
    }
  }
}

const EVENTS = ["play", "pause", "ended", "seeked", "volumechange"] as const;

function install(): void {
  if (installed) return;
  installed = true;
  EVENTS.forEach((t) => document.addEventListener(t, onAudioEvent, true));
}

function uninstall(): void {
  if (!installed) return;
  installed = false;
  EVENTS.forEach((t) => document.removeEventListener(t, onAudioEvent, true));
}

export function useAudioInstrumentation(): void {
  useEffect(() => {
    if (!studyLogger.isEnabled()) return;
    refCount++;
    install();
    return () => {
      refCount--;
      if (refCount <= 0) uninstall();
    };
  }, []);
}
