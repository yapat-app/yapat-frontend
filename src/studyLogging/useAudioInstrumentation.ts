/**
 * useAudioInstrumentation — capture play/pause/seek/volume on the internal <audio>
 * element rendered by react-audio-spectrogram-player (which exposes no callbacks).
 *
 * Every interaction is logged under ONE event, `audio_interaction`, discriminated
 * by `action` (play | pause | seek | volume). The snippet the player belongs to is
 * carried on the envelope's snippetId (resolved centrally from al.activeSnippetId —
 * the active card owns the player), so a single event type covers the whole player
 * for every phase (this hook is mounted by SnippetSpectrogramPlayer, used in every
 * phase's feed).
 *
 * Media events don't bubble, so we listen on `document` in the capture phase. The
 * listeners are installed once globally (ref-counted) even though several
 * SnippetSpectrogramPlayer instances may mount this hook.
 *
 * Only genuine user interactions are logged: the programmatic playhead reset to
 * 0 that fires when a new snippet's audio loads is a zero-distance seek and is
 * ignored, so no audio_interaction appears until the user actually plays, seeks,
 * or changes volume.
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
  /** Last volume seen, so a no-op / repeated volume event isn't logged. */
  lastVolume: number | null;
}

let refCount = 0;
let installed = false;
const states = new WeakMap<HTMLAudioElement, PlayState>();

function stateFor(el: HTMLAudioElement): PlayState {
  let s = states.get(el);
  if (!s) {
    s = {
      playStartTs: null,
      playStartPosMs: 0,
      lastPosMs: 0,
      lastVolume: null,
    };
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
  studyLogger.log("audio_interaction", {
    action: "pause",
    fromMs: s.playStartPosMs,
    toMs,
    listenedMs: Math.round(performance.now() - s.playStartTs),
  });
  s.playStartTs = null;
}

function onAudioEvent(e: Event): void {
  const el = e.target;
  if (!(el instanceof HTMLAudioElement)) return;
  const s = stateFor(el);

  switch (e.type) {
    case "play": {
      // Pressing play is a genuine user action (no autoplay in this player).
      s.playStartTs = performance.now();
      s.playStartPosMs = posMs(el);
      studyLogger.log("audio_interaction", {
        action: "play",
        positionMs: s.playStartPosMs,
      });
      break;
    }
    case "pause":
    case "ended": {
      // Only meaningful if a play segment was actually open (i.e. engaged).
      closeSegment(el, s);
      s.lastPosMs = posMs(el);
      break;
    }
    case "seeked": {
      const toMs = posMs(el);
      // The browser also fires `seeked` for programmatic playhead resets —
      // most commonly the reset to 0 when a new snippet's audio loads, which
      // showed up as spurious {fromMs:0,toMs:0} entries. A real user "sweep"
      // always moves the playhead, so ignore zero-distance seeks; a moved
      // playhead is itself a genuine engagement.
      if (toMs === s.lastPosMs) break;
      studyLogger.log("audio_interaction", {
        action: "seek",
        fromMs: s.lastPosMs,
        toMs,
      });
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
      const volume = Number(el.volume.toFixed(3));
      // Skip no-op repeats; the browser only fires volumechange on an actual
      // change, so every distinct value here is a genuine user adjustment.
      if (volume === s.lastVolume) break;
      s.lastVolume = volume;
      studyLogger.log("audio_interaction", { action: "volume", volume });
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
