import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SpectrogramPlayer from "react-audio-spectrogram-player";
import { Button, Skeleton, Tooltip } from "antd";
import {
  ArrowLeftOutlined,
  InfoCircleOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { SpectrogramAudioControls } from "../SpectrogramAudioControls";
import { useDatasetSpectrogramConfig } from "../../hooks/useDatasetSpectrogramConfig";
import { useSpectrogramPrefs } from "../../hooks/useSpectrogramPrefs";
import {
  PLACEHOLDER_SXX,
  useCustomSpectrogram,
} from "../../hooks/useCustomSpectrogram";
import {
  SPECTROGRAM_FALLBACK_SAMPLE_RATE,
  SPECTROGRAM_TIME_AXIS_HEIGHT,
  buildFreqTicks,
  formatSpectrogramHz,
  resolveSpectrogramDisplayRange,
} from "../../utils/spectrogramConfig";
import {
  SPECTROGRAM_COLORMAPS,
  SPECTROGRAM_SCALES,
  applyPrefsToDatasetRange,
  customAnalysisOf,
} from "../../utils/spectrogramPrefs";
import { spectrogramParamsForWindow } from "../../utils/spectrogramWindow";
import {
  FULL_RECORDING_MAX_SEC,
  FullRecordingTooLongError,
  isAbortError,
  loadFullRecordingAudio,
  type FullRecordingAudio,
} from "./recordingAudio";

/**
 * Listen-only view of a snippet's whole recording, drawn with the same
 * spectrogram player and the same user settings as the snippet cards, with the
 * snippet's own window highlighted. Nothing here can label.
 */

const DEFAULT_PLOT_HEIGHT = 220;
const MIN_PLOT_HEIGHT = 120;
// Same cap the snippet card uses when its label bar is a separate strip.
const MAX_PLOT_HEIGHT = 560;
/** Vertical space the card spends on everything except the plot itself. */
const CARD_CHROME_HEIGHT = 186;
/** Same width rule as the snippet card, so the two line up exactly. */
const CARD_WIDTH = "min(100%, 1200px)";
const ZOOM_SLIDER_STEPS = 1000;
/** It opens showing about this many snippet-lengths, with the snippet in the middle. */
const OPENING_VIEW_SNIPPETS = 5;
const Y_AXIS_WIDTH = 44;
const TIME_TICK_STEPS_SEC = [1, 2, 5, 10, 15, 30, 60, 120];
/** Neighbouring snippets get an id label once their slot is at least this wide. */
const NEIGHBOUR_LABEL_MIN_PX = 44;
/** From this width a chip shows just its arrow; thinner ones are a plain bar. */
const NEIGHBOUR_ARROW_MIN_PX = 14;
/** The current snippet's name tag only fits on its window once this wide. */
const SNIPPET_TAG_MIN_PX = 110;

type LoadState =
  | { key: string; status: "ready"; audio: FullRecordingAudio }
  | { key: string; status: "error" }
  | { key: string; status: "tooLong"; durationSec: number };

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  datasetId: number;
  snippetSetId: number | null;
  recordingId: number;
  snippetId: number;
  /** Closes the view and returns to the feed. */
  onBack: () => void;
  /** Jumps to another snippet of this recording in the feed. */
  onSelectSnippet: (snippetId: number) => void;
}

export const FullRecordingCard: React.FC<Props> = ({
  datasetId,
  snippetSetId,
  recordingId,
  snippetId,
  onBack,
  onSelectSnippet,
}) => {
  const { prefs } = useSpectrogramPrefs();
  const datasetSpectrogram = useDatasetSpectrogramConfig(datasetId);

  // ── Load the whole recording ────────────────────────────────────────────
  const loadKey = `${datasetId}|${snippetSetId}|${recordingId}`;
  const [load, setLoad] = useState<LoadState | null>(null);
  const [progress, setProgress] = useState<{
    key: string;
    done: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (snippetSetId === null) return;
    const controller = new AbortController();
    let url: string | null = null;
    void loadFullRecordingAudio({
      datasetId,
      snippetSetId,
      recordingId,
      signal: controller.signal,
      onProgress: (done, total) => setProgress({ key: loadKey, done, total }),
    })
      .then((audio) => {
        if (controller.signal.aborted) {
          URL.revokeObjectURL(audio.url);
          return;
        }
        url = audio.url;
        setLoad({ key: loadKey, status: "ready", audio });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setLoad(
          err instanceof FullRecordingTooLongError
            ? { key: loadKey, status: "tooLong", durationSec: err.durationSec }
            : { key: loadKey, status: "error" },
        );
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [datasetId, snippetSetId, recordingId, loadKey]);

  const current = load?.key === loadKey ? load : null;
  const audio = current?.status === "ready" ? current.audio : null;
  const snippetWin = audio?.windows.find((w) => w.id === snippetId) ?? null;
  const loadingPct =
    progress?.key === loadKey && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  // ── Spectrogram parameters (default prefs == what snippet cards use) ────
  const sampleRate = audio?.sampleRate ?? SPECTROGRAM_FALLBACK_SAMPLE_RATE;
  const { fMin, fMax } = useMemo(
    () =>
      resolveSpectrogramDisplayRange(
        sampleRate,
        applyPrefsToDatasetRange(datasetSpectrogram, prefs),
      ),
    [sampleRate, datasetSpectrogram, prefs],
  );
  const fftParams = useMemo(
    () => spectrogramParamsForWindow(sampleRate, prefs.windowMs, prefs.zeroPad),
    [sampleRate, prefs.windowMs, prefs.zeroPad],
  );
  // Options the player cannot draw itself (scale, gain, high boost, window
  // type): when any is set the picture is computed here and handed to it.
  const analysis = useMemo(
    () => customAnalysisOf(prefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these fields matter
    [prefs.scale, prefs.windowType, prefs.gainDb, prefs.highBoostDb],
  );
  const scale = analysis?.scale ?? "mel";
  const scaleLabel =
    SPECTROGRAM_SCALES.find((c) => c.id === scale)?.label ?? "Mel";
  const freqTicks = useMemo(
    () => buildFreqTicks(scale, fMin, fMax, 5),
    [scale, fMin, fMax],
  );
  const custom = useCustomSpectrogram({
    src: audio?.url ?? "",
    sampleRate,
    analysis: audio ? analysis : null,
    params: fftParams,
    fMin,
    fMax,
    rangeDb: prefs.rangeDb,
  });
  // An empty picture while ours is computed (so the default never flashes);
  // if the computation fails the player draws its own.
  const sxx = analysis
    ? (custom.sxx ?? (custom.pending ? PLACEHOLDER_SXX : undefined))
    : undefined;
  // Height is deliberately not in the key: it only rescales the drawing.
  const playerKey = `${audio?.url ?? ""}|${fMin}|${fMax}|${fftParams.n_fft}|${fftParams.win_length}|${fftParams.hop_length}|${prefs.rangeDb}${analysis ? "|x" : ""}`;
  const colormapLabel =
    SPECTROGRAM_COLORMAPS.find((c) => c.id === prefs.colormap)?.label ??
    prefs.colormap;

  // ── Layout: the plot takes whatever height the card is given ────────────
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [availH, setAvailH] = useState(0);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const plotH =
    availH > 0
      ? Math.round(
          Math.min(
            MAX_PLOT_HEIGHT,
            Math.max(MIN_PLOT_HEIGHT, availH - CARD_CHROME_HEIGHT),
          ),
        )
      : DEFAULT_PLOT_HEIGHT;

  // ── Viewport: scrolling + zoom ─────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  // null = the opening view (a little zoomed, around the snippet);
  // a number = the zoom the slider chose, in pixels per second.
  const [zoom, setZoom] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [audio]);

  const durationSec = audio?.durationSec ?? 0;
  const snippetDurSec = snippetWin
    ? Math.max(0.5, snippetWin.endSec - snippetWin.startSec)
    : 3;
  const fitPx = viewW > 0 && durationSec > 0 ? viewW / durationSec : 0;
  const snippetPx = viewW > 0 ? viewW / snippetDurSec : 0;
  const openingPx = Math.min(
    snippetPx,
    Math.max(fitPx, viewW / (snippetDurSec * OPENING_VIEW_SNIPPETS)),
  );
  const pxPerSec =
    zoom === null ? openingPx : Math.min(Math.max(zoom, fitPx), snippetPx * 4);
  const contentW = Math.max(viewW, Math.round(durationSec * pxPerSec));

  // Zooming keeps the middle of the view where it was. From the whole
  // recording there is no "where it was", so zooming in lands on the snippet.
  const centreSecRef = useRef<number | null>(null);
  const changeZoom = (next: number) => {
    const sc = scrollerRef.current;
    if (sc && pxPerSec > 0) {
      const fromWhole = viewW >= contentW - 1;
      centreSecRef.current =
        fromWhole && snippetWin
          ? (snippetWin.startSec + snippetWin.endSec) / 2
          : (sc.scrollLeft + viewW / 2) / pxPerSec;
    }
    setZoom(next);
  };

  const didCentreRef = useRef(false);
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || viewW <= 0 || pxPerSec <= 0) return;
    if (centreSecRef.current !== null) {
      sc.scrollLeft = Math.max(0, centreSecRef.current * pxPerSec - viewW / 2);
      centreSecRef.current = null;
    } else if (!didCentreRef.current && snippetWin) {
      didCentreRef.current = true;
      const mid = (snippetWin.startSec + snippetWin.endSec) / 2;
      sc.scrollLeft = Math.max(0, mid * pxPerSec - viewW / 2);
    }
  }, [viewW, pxPerSec, snippetWin]);

  // ── "Rendering…" until the player has drawn its picture ─────────────────
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  // The player's own picture, reused to fill the overview bar.
  const [overviewImg, setOverviewImg] = useState<{
    key: string;
    href: string;
  } | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Stays connected: a colour-scheme change redraws the picture in place,
    // and the overview bar must follow it.
    const check = () => {
      const img = root.querySelector('svg image[href^="data:"]');
      if (!img) return;
      const href = img.getAttribute("href");
      if (href)
        setOverviewImg((prev) =>
          prev?.key === playerKey && prev.href === href
            ? prev
            : { key: playerKey, href },
        );
      setPaintedKey(playerKey);
    };
    const first = requestAnimationFrame(check);
    const obs = new MutationObserver(check);
    obs.observe(root, { childList: true, subtree: true, attributes: true });
    return () => {
      cancelAnimationFrame(first);
      obs.disconnect();
    };
  }, [playerKey, audio]);
  const painted = paintedKey === playerKey;

  // ── Playback helpers (the player owns the <audio>; we only drive it) ────
  const live = useRef({ pxPerSec: 0, viewW: 0 });
  useEffect(() => {
    live.current = { pxPerSec, viewW };
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // `timeupdate` doesn't bubble, so listen in the capture phase.
    const onTime = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLAudioElement)) return;
      const t = el.currentTime;
      const sc = scrollerRef.current;
      if (!sc || el.paused) return;
      const x = t * live.current.pxPerSec;
      if (
        x < sc.scrollLeft + 16 ||
        x > sc.scrollLeft + live.current.viewW - 48
      ) {
        sc.scrollLeft = Math.max(0, x - live.current.viewW * 0.25);
      }
    };
    root.addEventListener("timeupdate", onTime, true);
    return () => {
      root.removeEventListener("timeupdate", onTime, true);
      // A detached <audio> keeps playing, so stop it when the view closes.
      root.querySelector("audio")?.pause();
    };
  }, [audio]);

  const audioEl = () => rootRef.current?.querySelector("audio") ?? null;

  const seekAndPlay = (sec: number) => {
    const el = audioEl();
    if (!el) return;
    el.currentTime = sec;
    void el.play().catch(() => {});
  };

  const scrubOverview = (clientX: number) => {
    const bar = overviewRef.current;
    const sc = scrollerRef.current;
    if (!bar || !sc) return;
    const r = bar.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    sc.scrollLeft = Math.max(0, f * contentW - viewW / 2);
  };

  // ── Not ready: loading / error / too long ───────────────────────────────
  const backButton = (
    <Button
      size="small"
      icon={<ArrowLeftOutlined />}
      className="shrink-0 h-5! px-1.5! gap-1! font-ibm-sans text-fs-10! [&_.anticon]:text-fs-10!"
      onClick={onBack}
    >
      Back to feed
    </Button>
  );
  const shell = (children: React.ReactNode) => (
    <div
      ref={cardRef}
      className="mx-auto h-full min-h-[280px] rounded-xl border border-gray-100 bg-white shadow-sm px-3 pt-3 pb-2.5 overflow-hidden"
      style={{ width: CARD_WIDTH, maxWidth: "100%" }}
    >
      {children}
    </div>
  );
  const message = (text: string) => (
    <div
      role="status"
      className="flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50 px-4 text-center text-xs text-gray-500 italic font-ibm-sans"
      style={{ height: plotH }}
    >
      {text}
    </div>
  );

  if (snippetSetId === null || current?.status === "error") {
    return shell(
      <>
        <div className="pb-2">{backButton}</div>
        {message("Audio unavailable")}
      </>,
    );
  }
  if (current?.status === "tooLong") {
    return shell(
      <>
        <div className="pb-2">{backButton}</div>
        {message(
          `This recording is ${formatClock(current.durationSec)} long. The full view supports up to ${formatClock(FULL_RECORDING_MAX_SEC)}.`,
        )}
      </>,
    );
  }
  if (!audio) {
    return shell(
      <div role="status" aria-live="polite">
        <div className="pb-2">{backButton}</div>
        <p className="m-0 mb-2 text-fs-11 text-gray-500 font-ibm-sans">
          Loading full recording ·{" "}
          <span className="font-ibm-mono">{loadingPct}%</span>
        </p>
        <Skeleton.Input
          active
          block
          style={{ height: plotH, borderRadius: 12, width: "100%" }}
        />
      </div>,
    );
  }

  // ── Ready ───────────────────────────────────────────────────────────────
  const tickStep =
    TIME_TICK_STEPS_SEC.find((s) => s * pxPerSec >= 64) ??
    TIME_TICK_STEPS_SEC[TIME_TICK_STEPS_SEC.length - 1];
  const ticks: number[] = [];
  for (let t = 0; t <= durationSec; t += tickStep) ticks.push(t);
  const pct = (sec: number) => `${(sec / durationSec) * 100}%`;
  const viewSec = pxPerSec > 0 ? Math.round(viewW / pxPerSec) : 0;

  // Zoom slider works on a log scale: Fit at the left, 4x snippet scale at the right.
  const maxPx = snippetPx * 4;
  const zoomSliderValue =
    fitPx > 0 && maxPx > fitPx
      ? Math.round(
          (Math.log(Math.min(Math.max(pxPerSec, fitPx), maxPx) / fitPx) /
            Math.log(maxPx / fitPx)) *
            ZOOM_SLIDER_STEPS,
        )
      : 0;
  const zoomFromSlider = (v: number) =>
    fitPx * Math.pow(maxPx / fitPx, v / ZOOM_SLIDER_STEPS);

  return shell(
    <>
      {/* What this is */}
      <div className="flex items-center gap-2 pb-1.5">
        {backButton}
        <p className="m-0 min-w-0 flex-1 truncate text-fs-10 text-gray-500 font-ibm-sans">
          <span className="font-ibm-mono font-semibold text-gray-700">
            {formatClock(durationSec)}
          </span>{" "}
          total · {Math.round(sampleRate / 100) / 10} kHz
          {snippetWin && (
            <>
              {" "}
              · Snippet #{snippetId} at{" "}
              <span className="font-ibm-mono text-gray-700">
                {formatClock(snippetWin.startSec)}–
                {formatClock(snippetWin.endSec)}
              </span>
            </>
          )}
        </p>
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="rounded-full bg-gray-100 px-1.5 py-px text-fs-9 text-gray-600 font-ibm-mono">
            {scaleLabel} · {formatSpectrogramHz(fMin)}–{formatSpectrogramHz(fMax)} ·{" "}
            {colormapLabel}
          </span>
          <Tooltip
            placement="topRight"
            title="Colours are scaled to the whole recording, so the highlighted snippet can look slightly different from its card. The Sensitivity setting helps when comparing."
            styles={{
              root: { maxWidth: 230 },
              container: { fontSize: 11, lineHeight: 1.45, padding: "6px 9px" },
            }}
          >
            <InfoCircleOutlined className="text-fs-11 text-gray-400" />
          </Tooltip>
        </div>
      </div>

      {/* Zoom: how much of the recording is on screen */}
      <div className="flex items-center gap-2 pb-1.5">
        <ZoomOutOutlined className="text-fs-11 text-gray-400" aria-hidden />
        <input
          type="range"
          aria-label="Zoom"
          title="Zoom out / in (all the way left shows the whole recording)"
          min={0}
          max={ZOOM_SLIDER_STEPS}
          step={1}
          value={zoomSliderValue}
          disabled={maxPx <= fitPx}
          onChange={(e) => changeZoom(zoomFromSlider(Number(e.target.value)))}
          className="snippet-audio-seek w-40 shrink-0 cursor-pointer disabled:cursor-default"
          style={
            { "--seek-pct": `${zoomSliderValue / 10}%` } as React.CSSProperties
          }
        />
        <ZoomInOutlined className="text-fs-11 text-gray-400" aria-hidden />
        <span className="text-fs-10 text-gray-500 font-ibm-sans">
          {viewSec >= durationSec
            ? "whole recording in view"
            : `${viewSec} s in view`}
        </span>
      </div>

      {/* Overview of the whole file */}
      <div
        ref={overviewRef}
        role="presentation"
        title="Whole recording: drag to move through it"
        className="relative mb-2 h-7 cursor-pointer rounded-md bg-gray-100 select-none touch-none overflow-hidden"
        style={{
          marginLeft: Y_AXIS_WIDTH,
          ...(overviewImg?.key === playerKey
            ? {
                backgroundImage: `url("${overviewImg.href}")`,
                backgroundSize: "100% 100%",
              }
            : null),
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubOverview(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) scrubOverview(e.clientX);
        }}
      >
        {snippetWin && (
          <div
            className="absolute top-0 h-full bg-yellow-400/80"
            style={{
              left: pct(snippetWin.startSec),
              width: `max(3px, ${((snippetWin.endSec - snippetWin.startSec) / durationSec) * 100}%)`,
            }}
          />
        )}
        <div
          // Like the navigator strip in audio editors: the part in view keeps
          // its full colour, and the rest is softly shaded. The frame is the
          // app's blue, which stays readable against the white page where the
          // window meets the bar's edge.
          className="absolute top-0 h-full rounded-md border-[3px] border-blue-600"
          style={{
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.5)",
            left: `${(scrollLeft / contentW) * 100}%`,
            width: `${Math.min(100, (viewW / contentW) * 100)}%`,
          }}
        />
      </div>

      {/* Spectrogram: fixed Hz axis + horizontally scrolling plot */}
      <div className="flex w-full min-w-0">
        <div
          className="shrink-0 self-start flex flex-col justify-between text-fs-10 text-gray-500 font-ibm-mono pr-1 select-none"
          style={{ width: Y_AXIS_WIDTH, height: plotH }}
          aria-hidden
        >
          {freqTicks.map((hz) => (
            <span key={hz} className="leading-none text-right">
              {formatSpectrogramHz(hz)}
            </span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0">
          {(!painted || custom.pending) && (
            <div
              role="status"
              className="absolute inset-x-0 top-0 z-10 flex items-center justify-center rounded bg-white/80 text-fs-11 text-gray-500 font-ibm-sans pointer-events-none"
              style={{ height: plotH }}
            >
              Rendering spectrogram…
            </div>
          )}
          <div
            ref={scrollerRef}
            tabIndex={0}
            aria-label="Full-recording spectrogram. Scroll sideways, or click to play from a point."
            className="min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          >
            <div className="relative" style={{ width: contentW }}>
              {/*
                The player stretches its picture to this wide box, and draws the
                red playhead with a width proportional to the file length, so on a
                long recording it becomes a huge red slab. Keep it a thin line.
              */}
              <div
                ref={rootRef}
                className="snippet-spectrogram overflow-hidden [&_line]:[vector-effect:non-scaling-stroke] [&_line]:[stroke-width:2px]"
                style={{ height: plotH }}
              >
                <SpectrogramPlayer
                  key={playerKey}
                  src={audio.url}
                  sampleRate={sampleRate}
                  n_fft={fftParams.n_fft}
                  win_length={fftParams.win_length}
                  hop_length={fftParams.hop_length}
                  f_min={fMin}
                  f_max={fMax}
                  n_mels={fftParams.n_mels}
                  top_db={prefs.rangeDb}
                  sxx={sxx}
                  specHeight={plotH}
                  navigator={false}
                  settings={false}
                  dark={false}
                  colormap={prefs.colormap}
                />
              </div>

              {/* Where the neighbouring snippets start (each has its own slot). */}
              {audio.windows.map((w, i) => {
                if (w.id === snippetId) return null;
                const slotEnd = audio.windows[i + 1]?.startSec ?? w.endSec;
                const slotPx = (slotEnd - w.startSec) * pxPerSec;
                return (
                  <div
                    key={w.id}
                    // Hovering its chip outlines the whole slot in blue (like
                    // the selected snippet's yellow outline) and tints it, so
                    // it is clear which snippet a click will open.
                    className="absolute top-0 pointer-events-none border-l border-white/30 has-[button:hover]:bg-blue-400/20 has-[button:hover]:border-2 has-[button:hover]:border-blue-500"
                    style={{ left: pct(w.startSec), height: plotH, width: slotPx }}
                  >
                    {slotPx >= 1 && (
                      // A slot too thin for any text is still hoverable and
                      // clickable: the chip simply fills it. The hover text is
                      // the browser's own, shown below the pointer.
                      <button
                        type="button"
                        title={`Open snippet #${w.id} in the feed`}
                        aria-label={`Open snippet ${w.id} in the feed`}
                        className="absolute -top-px left-0 z-10 flex h-4 max-w-full cursor-pointer items-center gap-0.5 overflow-hidden whitespace-nowrap rounded-br border-0 bg-slate-900/70 p-0 text-left text-fs-9 font-semibold leading-tight text-white font-ibm-mono pointer-events-auto hover:bg-blue-600"
                        style={
                          slotPx < NEIGHBOUR_LABEL_MIN_PX
                            ? { width: slotPx }
                            : { paddingInline: 4 }
                        }
                        onClick={() => onSelectSnippet(w.id)}
                      >
                        {slotPx >= NEIGHBOUR_LABEL_MIN_PX
                          ? `#${w.id} ↗`
                          : slotPx >= NEIGHBOUR_ARROW_MIN_PX
                            ? "↗"
                            : null}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Parts of the recording no snippet covers (played as silence). */}
              {audio.gaps.map((g) => (
                <div
                  key={g.startSec}
                  aria-hidden
                  className="absolute top-0 pointer-events-none"
                  style={{
                    left: pct(g.startSec),
                    width: `${((g.endSec - g.startSec) / durationSec) * 100}%`,
                    height: plotH,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(15,23,42,0.35) 0 4px, transparent 4px 8px)",
                  }}
                />
              ))}

              {/* Click anywhere to play from that point. */}
              <div
                className="absolute top-0 left-0 w-full cursor-pointer"
                style={{ height: plotH }}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seekAndPlay(((e.clientX - r.left) / r.width) * durationSec);
                }}
              />

              {/* The selected snippet's own window. */}
              {snippetWin && (
                <div
                  aria-hidden
                  className="absolute top-0 pointer-events-none border-2 border-yellow-400 bg-yellow-300/20"
                  style={{
                    left: pct(snippetWin.startSec),
                    width: `max(4px, ${((snippetWin.endSec - snippetWin.startSec) / durationSec) * 100}%)`,
                    height: plotH,
                  }}
                >
                  {/* Always there, so a window too narrow for its name tag
                      still stands out from the neighbours' chips. */}
                  <span className="absolute -top-0.5 -left-0.5 -right-0.5 h-1.5 bg-yellow-400" />
                  {(() => {
                    // Same steps as the neighbours' chips: the number goes
                    // once the window is narrower than NEIGHBOUR_LABEL_MIN_PX.
                    const winPx =
                      (snippetWin.endSec - snippetWin.startSec) * pxPerSec;
                    if (winPx < NEIGHBOUR_LABEL_MIN_PX) return null;
                    return (
                      <span className="absolute -top-px left-0 whitespace-nowrap rounded-br bg-yellow-400 px-1 py-px text-fs-9 font-semibold leading-tight text-gray-900 font-ibm-sans">
                        {winPx >= SNIPPET_TAG_MIN_PX
                          ? `Snippet #${snippetId}`
                          : `#${snippetId}`}
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Time axis */}
              <div
                className="relative border-t border-gray-100 select-none"
                style={{ height: SPECTROGRAM_TIME_AXIS_HEIGHT, marginTop: 2 }}
                aria-hidden
              >
                {ticks
                  // Don't draw a label that would be cut off at either edge.
                  .filter((t) => {
                    const x = t * pxPerSec - scrollLeft;
                    return t === 0 || (x >= 16 && x <= viewW - 16);
                  })
                  .map((t) => (
                    <span
                      key={t}
                      className="absolute top-0.5 text-fs-10 leading-tight text-gray-500 font-ibm-mono"
                      style={{
                        left: t * pxPerSec,
                        transform: t === 0 ? "none" : "translateX(-50%)",
                      }}
                    >
                      {formatClock(t)}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginLeft: Y_AXIS_WIDTH }}>
        <SpectrogramAudioControls
          rootRef={rootRef}
          resetKey={playerKey}
          fallbackDuration={durationSec}
        />
      </div>

      <p className="m-0 mt-1 text-center text-fs-9 text-gray-400 font-ibm-sans">
        Listen only · close the full recording to label this snippet
        {audio.gaps.length > 0 && (
          <span className="text-amber-700">
            {" "}
            · hatched parts have no snippets and play as silence
          </span>
        )}
      </p>
    </>,
  );
};
