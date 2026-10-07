import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CaretRightFilled,
  PauseOutlined,
  SoundOutlined,
  MutedOutlined,
} from "@ant-design/icons";

/**
 * Compact audio controller for a snippet spectrogram.
 *
 * react-audio-spectrogram-player renders its own native `<audio controls>` bar,
 * whose size, font and icons can't be styled. index.css hides that bar and this
 * component drives the *same* `<audio>` element instead, so the library's red
 * playhead and the study-log audio instrumentation keep working unchanged.
 */

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  rootRef: React.RefObject<HTMLElement | null>;
  resetKey: string;
  /** Duration known up front (seconds); the element's own duration wins once loaded. */
  fallbackDuration?: number | null;
}

export const SpectrogramAudioControls: React.FC<Props> = ({
  rootRef,
  resetKey,
  fallbackDuration,
}) => {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const rafRef = useRef<number | null>(null);
  // Same element as `audio`; writes (play state, seek, mute) go through the ref.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Find the library's <audio> element (it may appear a tick after mount).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const find = () => root.querySelector("audio");
    const attach = (el: HTMLAudioElement) => {
      audioRef.current = el;
      setAudio(el);
    };
    const obs = new MutationObserver(() => {
      const el = find();
      if (el) {
        attach(el);
        obs.disconnect();
      }
    });
    const found = find();
    if (found) {
      // Deferred a frame so the effect body itself doesn't set state.
      const id = requestAnimationFrame(() => attach(found));
      return () => cancelAnimationFrame(id);
    }
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [rootRef, resetKey]);

  // Mirror the element's state.
  useEffect(() => {
    if (!audio) return;
    const sync = () => {
      setPlaying(!audio.paused && !audio.ended);
      setCurrent(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      setMuted(audio.muted || audio.volume === 0);
    };
    const first = requestAnimationFrame(sync);
    const events = [
      "play",
      "pause",
      "ended",
      "timeupdate",
      "seeked",
      "durationchange",
      "loadedmetadata",
      "volumechange",
    ];
    events.forEach((e) => audio.addEventListener(e, sync));
    return () => {
      cancelAnimationFrame(first);
      events.forEach((e) => audio.removeEventListener(e, sync));
    };
  }, [audio]);

  // timeupdate only fires ~4x/s; follow the playhead per frame while playing
  // so the progress bar glides instead of stepping.
  useEffect(() => {
    if (!audio || !playing) return;
    const tick = () => {
      setCurrent(audio.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [audio, playing]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused || el.ended) void el.play().catch(() => {});
    else el.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (el) el.muted = !el.muted;
  }, []);

  const total = duration || fallbackDuration || 0;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <div
      className="snippet-audio-controls flex items-center gap-2 h-8 laptop:h-7! mt-1.5 rounded-full bg-gray-100 pl-1 pr-2.5 font-ibm-sans select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={togglePlay}
        disabled={!audio}
        aria-label={playing ? "Pause" : "Play"}
        className="shrink-0 flex items-center justify-center h-6 w-6 laptop:h-5! laptop:w-5! rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:text-gray-900 hover:ring-gray-400 transition-colors disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        {playing ? (
          <PauseOutlined className="text-fs-11 laptop:text-[10px]!" />
        ) : (
          <CaretRightFilled className="text-fs-12 laptop:text-[11px]! translate-x-px" />
        )}
      </button>

      <span className="shrink-0 text-fs-11 text-gray-500 font-ibm-mono tabular-nums">
        {formatTime(current)} / {formatTime(total)}
      </span>

      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={total || 1}
        step={0.01}
        value={Math.min(current, total || 1)}
        disabled={!audio || total <= 0}
        onChange={(e) => {
          const el = audioRef.current;
          if (!el) return;
          const t = Number(e.target.value);
          el.currentTime = t;
          setCurrent(t);
        }}
        className="snippet-audio-seek flex-1 min-w-0 cursor-pointer disabled:cursor-default"
        style={{ "--seek-pct": `${pct}%` } as React.CSSProperties}
      />

      <button
        type="button"
        onClick={toggleMute}
        disabled={!audio}
        aria-label={muted ? "Unmute" : "Mute"}
        className="shrink-0 flex items-center justify-center h-6 w-6 rounded-full text-gray-500 hover:text-gray-900 hover:bg-white transition-colors disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        {muted ? (
          <MutedOutlined className="text-fs-13 laptop:text-[12px]!" />
        ) : (
          <SoundOutlined className="text-fs-13 laptop:text-[12px]!" />
        )}
      </button>
    </div>
  );
};
