/**
 * The feed while Status = "To review": one shared-label suggestion at a time.
 *
 * Shows the target clip with the hub's spectrogram player (the source clip's
 * part shaded), where both clips sit on the recording, the suggestion and why
 * it needs a listen, and the clip's labels now. Accept / Reject act on the
 * suggestion; picking another label below relabels the clip instead.
 *
 * A recheck (reason `source_removed`) is a label this clip already has whose
 * source label was deleted: Keep / Remove, on the same A / R keys, no relabel.
 *
 * Keys (ignored while typing): N/↓/J next, P/↑/K previous, A accept, R reject,
 * L puts the cursor in the label search.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Empty, Skeleton, Spin, Tag, Tooltip } from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  ExpandAltOutlined,
  LinkOutlined,
  ShrinkOutlined,
} from "@ant-design/icons";
import { SnippetSpectrogramPlayer } from "../SnippetSpectrogramPlayer";
import { FullRecordingCard } from "../fullRecording/FullRecordingCard";
import { LabelSelector } from "./LabelSelector";
import { snippetApi } from "../../services/api";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { useDatasetSpectrogramConfig } from "../../hooks/useDatasetSpectrogramConfig";
import { useSpectrogramPrefs } from "../../hooks/useSpectrogramPrefs";
import {
  applyPrefsToDatasetRange,
  customAnalysisOf,
  isDefaultSpectrogramPrefs,
} from "../../utils/spectrogramPrefs";
import {
  describeReason,
  type LabelSharingSession,
} from "../../pages/annotationHub/useLabelSharing";
import type { LabelShareCandidate } from "../../types/labelSharing";

type Props = {
  session: LabelSharingSession;
  quickLabels: string[];
  quickLabelsLoading: boolean;
};

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], .ant-popover',
      ))
  );
}

/** ↑ / ↓ key chips, styled like the feed's snippet header hint. */
const NAV_KEY_CLASS =
  "min-w-5 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center font-ibm-mono text-fs-10 leading-none text-gray-500 shadow-sm cursor-pointer hover:border-gray-300 hover:text-gray-700 disabled:cursor-default disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-500";

/** Shortcut hint inside an action button. */
const Kbd: React.FC<{ children: React.ReactNode; onDark?: boolean }> = ({
  children,
  onDark,
}) => (
  <kbd
    className={[
      "ml-auto rounded px-1.5 py-px font-ibm-mono text-fs-10 font-semibold leading-4",
      onDark ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
    ].join(" ")}
  >
    {children}
  </kbd>
);

/** One of the three review actions: icon, word, shortcut. */
const ActionButton: React.FC<{
  tone: "accept" | "reject" | "relabel";
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  emphasized?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({
  tone,
  icon,
  label,
  shortcut,
  emphasized,
  loading,
  disabled,
  onClick,
}) => {
  const solid = tone === "accept" ? emphasized !== false : !!emphasized;
  const palette = {
    accept: solid
      ? "bg-emerald-700! border-emerald-700! text-white! hover:bg-emerald-800! hover:border-emerald-800!"
      : "bg-white! border-emerald-600! text-emerald-800! hover:bg-emerald-50!",
    reject: solid
      ? "bg-red-700! border-red-700! text-white! hover:bg-red-800! hover:border-red-800!"
      : "bg-white! border-red-300! text-red-700! hover:bg-red-50! hover:border-red-400!",
    relabel:
      "bg-white! border-gray-300! text-gray-700! hover:bg-gray-50! hover:border-gray-400!",
  }[tone];
  return (
    <Button
      block
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      aria-keyshortcuts={shortcut}
      className={`h-10! rounded-lg! px-3! font-semibold! font-ibm-sans ${palette}`}
    >
      <span className="flex w-full items-center gap-2">
        {icon}
        {label}
        <Kbd onDark={solid && tone !== "relabel"}>{shortcut}</Kbd>
      </span>
    </Button>
  );
};

/** Both clips on the recording, over their union plus one clip either side. */
const RecordingStrip: React.FC<{ c: LabelShareCandidate }> = ({ c }) => {
  const pad = Math.max(c.target.end_time - c.target.start_time, 1);
  const from = Math.max(
    0,
    Math.min(c.source.start_time, c.target.start_time) - pad,
  );
  const to = Math.max(c.source.end_time, c.target.end_time) + pad;
  const span = to - from;
  const pos = (t: number) => `${((t - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  return (
    <div
      className="flex flex-col gap-0.5"
      aria-label="Where the snippets sit on the recording"
    >
      <div className="relative h-[18px] rounded bg-gray-100">
        <Tooltip
          title={`This snippet · ${clock(c.target.start_time)}–${clock(c.target.end_time)}`}
        >
          <div
            className="absolute top-0.5 h-[7px] rounded-sm bg-blue-600"
            style={{
              left: pos(c.target.start_time),
              width: width(c.target.start_time, c.target.end_time),
            }}
          />
        </Tooltip>
        <Tooltip
          title={`${c.source_labeled_by ?? "Source"}'s snippet · ${clock(c.source.start_time)}–${clock(c.source.end_time)}`}
        >
          <div
            className="absolute bottom-0.5 h-[7px] rounded-sm bg-orange-600"
            style={{
              left: pos(c.source.start_time),
              width: width(c.source.start_time, c.source.end_time),
            }}
          />
        </Tooltip>
      </div>
      <div className="flex justify-between gap-2 text-fs-10 text-gray-500 font-ibm-sans">
        <span className="font-ibm-mono">{clock(from)}</span>
        <span>
          <span className="text-blue-600">■</span> this snippet{"  "}
          <span className="text-orange-600">■</span> labelled snippet · overlap{" "}
          {c.overlap_seconds.toFixed(1)} s
        </span>
        <span className="font-ibm-mono">{clock(to)}</span>
      </div>
    </div>
  );
};

/** Loads one snippet's audio as a blob URL, revoking the previous one. */
function useSnippetAudio(snippetId: number | null) {
  const [state, setState] = useState<{
    id: number;
    url: string | null;
    sampleRate: number;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (snippetId === null) return;
    const controller = new AbortController();
    let url: string | null = null;
    snippetApi
      .getSnippetAudio(snippetId, controller.signal)
      .then((r) => {
        url = r.url;
        setState({
          id: snippetId,
          url: r.url,
          sampleRate: r.sampleRate,
          error: false,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ id: snippetId, url: null, sampleRate: 0, error: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [snippetId]);
  const current = state && state.id === snippetId ? state : null;
  return {
    audio:
      current && current.url
        ? { url: current.url, sampleRate: current.sampleRate }
        : null,
    error: !!current?.error,
  };
}

export const ShareReviewPanel: React.FC<Props> = ({
  session,
  quickLabels,
  quickLabelsLoading,
}) => {
  const dispatch = useAppDispatch();
  const { current: c, items, index, decided, busy, loading, total } = session;
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const selectedSnippetId = useAppSelector(
    (s) => s.al.selectedSnippetIds[0] ?? null,
  );
  const labelAreaRef = useRef<HTMLDivElement | null>(null);

  // Spectrogram settings: the same dataset band and personal prefs as the feed.
  const datasetConfig = useDatasetSpectrogramConfig(selectedDatasetId);
  const { prefs } = useSpectrogramPrefs();
  const customSpectrogram = !isDefaultSpectrogramPrefs(prefs);
  const datasetSpectrogram = useMemo(
    () => applyPrefsToDatasetRange(datasetConfig, prefs),
    [datasetConfig, prefs],
  );

  const targetId = c?.target.snippet_id ?? null;
  const { audio, error: audioError } = useSnippetAudio(targetId);

  // The projection follows the item under review…
  useEffect(() => {
    if (targetId !== null) dispatch(setSelectedSnippet(targetId));
  }, [dispatch, targetId]);
  // …and a click on a ringed point opens that item.
  useEffect(() => {
    if (selectedSnippetId === null || selectedSnippetId === targetId) return;
    const i = items.findIndex(
      (it) => it.target.snippet_id === selectedSnippetId,
    );
    if (i >= 0) session.go(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSnippetId]);

  // Full recording: stays open while stepping, following each suggestion.
  const [fullOpen, setFullOpen] = useState(false);
  const openFull = useCallback(() => {
    // One thing playing at a time.
    document.querySelectorAll("audio").forEach((a) => a.pause());
    setFullOpen(true);
  }, []);
  const closeFull = useCallback(() => setFullOpen(false), []);

  const isDecided = c ? decided[c.id] !== undefined : false;
  const focusLabelSearch = useCallback(
    () =>
      labelAreaRef.current?.querySelector<HTMLInputElement>("input")?.focus(),
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "escape" && fullOpen) {
        e.preventDefault();
        closeFull();
      } else if (key === "arrowdown") {
        e.preventDefault();
        session.step(1);
      } else if (key === "arrowup") {
        e.preventDefault();
        session.step(-1);
      } else if (key === "a" && !e.shiftKey) {
        e.preventDefault();
        void session.decide("accept", { input: "keyboard" });
      } else if (key === "r" && !e.shiftKey) {
        e.preventDefault();
        void session.decide("reject", { input: "keyboard" });
      } else if (
        key === "l" &&
        !e.shiftKey &&
        session.current?.reason !== "source_removed"
      ) {
        e.preventDefault();
        focusLabelSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, focusLabelSearch, fullOpen, closeFull]);

  if (loading && items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 font-ibm-sans text-xs text-gray-500">
        <Spin />
        Loading suggestions…
      </div>
    );
  }

  const remaining = items.filter((it) => decided[it.id] === undefined).length;
  if (!c || (remaining === 0 && isDecided)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Empty
          description={
            <span className="font-ibm-sans text-gray-600">
              Nothing left to review on this model's snippets.
              {session.pendingElsewhere > 0 &&
                ` ${session.pendingElsewhere} more wait on the other models' snippets.`}
            </span>
          }
        />
        <Button
          type="primary"
          onClick={() => session.setReviewing(false, "empty_state")}
        >
          Back to the feed
        </Button>
      </div>
    );
  }

  const reason = describeReason(c);
  const tgtLen = c.target.end_time - c.target.start_time;
  // A recheck's source label is gone, so there is nothing to compare against.
  const recheck = c.reason === "source_removed";
  const highlight = recheck
    ? null
    : {
        start: Math.max(0, c.source.start_time - c.target.start_time),
        end: Math.min(tgtLen, c.source.end_time - c.target.start_time),
        label: c.source_labeled_by
          ? `Labelled by ${c.source_labeled_by}`
          : "Labelled snippet",
      };
  const outcome = decided[c.id];
  const conflict = c.reason === "conflict";
  // The clip may already carry the suggested label, e.g. copied from another
  // clip that lies fully inside it. A recheck's label is always there.
  const alreadyHas =
    !recheck &&
    c.target_labels.some((l) => l.toLowerCase() === c.label.toLowerCase());
  const outcomeText =
    outcome === "taken"
      ? recheck
        ? "This label was already settled."
        : "This suggestion was already settled."
      : recheck
        ? outcome === "accepted"
          ? "You kept this label."
          : "You removed this label."
        : `You ${outcome} this suggestion.`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: one row. Which clip, then position and stepping. */}
      <div className="shrink-0 flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-1.5 text-xs font-ibm-sans">
        <span className="shrink-0 font-ibm-mono font-semibold text-gray-800">
          Snippet #{c.target.snippet_id}
        </span>
        <div className="min-w-0 flex-1">
          <Tooltip
            title={
              <>
                {c.target.recording_file_name ??
                  `Recording ${c.target.recording_id}`}
                <br />
                {fullOpen
                  ? "Back to the snippet (Esc)"
                  : recheck
                    ? "Open the full recording, with this snippet marked"
                    : "Open the full recording, with both snippets marked"}
              </>
            }
            placement="bottomLeft"
          >
            <Button
              size="small"
              type={fullOpen ? "primary" : "text"}
              icon={fullOpen ? <ShrinkOutlined /> : <ExpandAltOutlined />}
              aria-pressed={fullOpen}
              onClick={() => (fullOpen ? closeFull() : openFull())}
              className={[
                "max-w-full -ml-1 h-5! px-1.5! text-fs-11! font-ibm-sans [&_.anticon]:shrink-0",
                fullOpen
                  ? ""
                  : "text-gray-500! hover:text-blue-600! hover:bg-blue-50!",
              ].join(" ")}
            >
              <span className="min-w-0 truncate">
                {c.target.recording_file_name ??
                  `Recording ${c.target.recording_id}`}
              </span>
            </Button>
          </Tooltip>
        </div>
        <span className="shrink-0 font-ibm-mono text-gray-600">
          {clock(c.target.start_time)}–{clock(c.target.end_time)}
        </span>
        {/* Same ↑ ↓ hint as the feed's snippet header; the keys are also
            clickable so mouse users can step too. */}
        <div
          className="flex shrink-0 items-center gap-2"
          role="group"
          aria-label="Move through suggestions"
        >
          <Tooltip title="Keyboard shortcuts: previous / next suggestion">
            <span className="inline-flex items-center gap-1 text-fs-10 text-gray-400 font-ibm-sans select-none">
              <button
                type="button"
                aria-label="Previous suggestion"
                aria-keyshortcuts="ArrowUp"
                disabled={index === 0}
                onClick={() => session.step(-1)}
                className={NAV_KEY_CLASS}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Next suggestion"
                aria-keyshortcuts="ArrowDown"
                disabled={index >= items.length - 1}
                onClick={() => session.step(1)}
                className={NAV_KEY_CLASS}
              >
                ↓
              </button>
              Previous / next
            </span>
          </Tooltip>
          <span className="min-w-[52px] rounded bg-orange-50 px-1.5 py-0.5 text-center font-semibold tabular-nums text-orange-700">
            {index + 1} / {Math.max(total, items.length)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {/* The whole recording with both clips marked, in place of the clip
            card; the suggestion and its buttons stay below. */}
        {fullOpen && selectedDatasetId !== null && (
          <div className="h-[460px] shrink-0">
            <FullRecordingCard
              datasetId={Number(selectedDatasetId)}
              snippetSetId={c.target.snippet_set_id}
              recordingId={c.target.recording_id}
              snippetId={c.target.snippet_id}
              compareClip={
                recheck
                  ? null
                  : {
                      startSec: c.source.start_time,
                      endSec: c.source.end_time,
                      label: "Labelled snippet",
                    }
              }
              onBack={closeFull}
              backLabel="Back to snippet"
              note={
                recheck
                  ? "Yellow: this snippet · decide below"
                  : "Yellow: this snippet · orange: the labelled snippet · decide below"
              }
            />
          </div>
        )}

        {/* Target clip */}
        <div
          className={[
            "rounded-xl border border-gray-100 bg-white px-3 pt-3 pb-2.5 shadow-sm flex flex-col gap-2",
            fullOpen ? "hidden" : "",
          ].join(" ")}
        >
          {audio ? (
            <SnippetSpectrogramPlayer
              key={`${c.target.snippet_id}|${audio.url}`}
              src={audio.url}
              sampleRate={audio.sampleRate}
              datasetSpectrogram={datasetSpectrogram}
              durationSec={tgtLen}
              specHeight={260}
              colormap={customSpectrogram ? prefs.colormap : "viridis"}
              rangeDb={customSpectrogram ? prefs.rangeDb : undefined}
              windowMs={customSpectrogram ? prefs.windowMs : undefined}
              zeroPad={customSpectrogram ? prefs.zeroPad : undefined}
              analysis={customSpectrogram ? customAnalysisOf(prefs) : null}
              highlight={highlight}
            />
          ) : audioError ? (
            <div className="flex h-[260px] items-center justify-center rounded bg-gray-50 text-sm italic text-gray-400">
              Audio unavailable
            </div>
          ) : (
            <Skeleton.Input active block style={{ height: 260 }} />
          )}
          {!recheck && <RecordingStrip c={c} />}
          <button
            type="button"
            onClick={openFull}
            className="flex cursor-pointer items-center gap-1 self-end border-0 bg-transparent p-0 text-fs-10 text-blue-600 font-ibm-sans hover:underline"
          >
            <ExpandAltOutlined />{" "}
            {recheck
              ? "Listen in the full recording"
              : "Listen to both snippets in the full recording"}
          </button>
        </div>

        {/* Recheck: a label the snippet has, whose source label was removed */}
        {recheck && (
          <section
            aria-label="Label to recheck"
            className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex flex-col gap-2 font-ibm-sans"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-fs-10 font-semibold uppercase tracking-wider text-amber-800">
                Recheck · optional
              </span>
              <Tag
                icon={<LinkOutlined />}
                color="blue"
                className="m-0 font-semibold"
                title={c.taxon_id}
              >
                {c.label}
              </Tag>
              <span className="text-xs text-gray-600">
                is on this snippet
              </span>
            </div>
            <p className="m-0 text-xs text-amber-950">
              <strong>{reason.title}</strong> {reason.detail}
            </p>
            {outcome ? (
              <p className="m-0 text-xs font-semibold text-gray-600">
                {outcomeText}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <ActionButton
                  tone="accept"
                  icon={<CheckOutlined />}
                  label="Keep label"
                  shortcut="A"
                  loading={busy}
                  onClick={() =>
                    void session.decide("accept", { input: "mouse" })
                  }
                />
                <ActionButton
                  tone="reject"
                  icon={<CloseOutlined />}
                  label="Remove label"
                  shortcut="R"
                  disabled={busy}
                  onClick={() =>
                    void session.decide("reject", { input: "mouse" })
                  }
                />
              </div>
            )}
          </section>
        )}

        {/* Suggestion */}
        <section
          aria-label="Shared suggestion"
          hidden={recheck}
          className={[
            "rounded-lg border px-3 py-2.5 flex flex-col gap-2 font-ibm-sans",
            conflict
              ? "border-red-200 bg-red-50/60"
              : "border-orange-200 bg-orange-50/50",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fs-10 font-semibold uppercase tracking-wider text-orange-700">
              Shared suggestion
            </span>
            <span className="font-semibold text-gray-800">Add</span>
            <Tag
              icon={<LinkOutlined />}
              color="blue"
              className="m-0 border-dashed! font-semibold"
              title={c.taxon_id}
            >
              {c.label}
            </Tag>
            <span className="text-xs text-gray-500">
              from {c.source_labeled_by ?? "another annotator"} ·{" "}
              {(c.source.end_time - c.source.start_time).toFixed(1)} s snippet
              at {clock(c.source.start_time)}
            </span>
          </div>
          <p
            className={`m-0 text-xs ${conflict ? "text-red-900" : "text-orange-950"}`}
          >
            <strong>{reason.title}</strong> {reason.detail}
          </p>
          {alreadyHas && !outcome && (
            <p className="m-0 rounded-md bg-white/70 px-2 py-1 text-xs text-gray-700">
              This snippet already has “{c.label}”, so accepting adds nothing.
              Reject to clear the suggestion.
            </p>
          )}
          {outcome ? (
            <p className="m-0 text-xs font-semibold text-gray-600">
              {outcomeText}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <ActionButton
                tone="accept"
                icon={<CheckOutlined />}
                label="Accept"
                shortcut="A"
                emphasized={!conflict && !alreadyHas}
                loading={busy}
                onClick={() =>
                  void session.decide("accept", { input: "mouse" })
                }
              />
              <ActionButton
                tone="reject"
                icon={<CloseOutlined />}
                label="Reject"
                shortcut="R"
                emphasized={conflict || alreadyHas}
                disabled={busy}
                onClick={() =>
                  void session.decide("reject", { input: "mouse" })
                }
              />
              <ActionButton
                tone="relabel"
                icon={<EditOutlined />}
                label="Relabel…"
                shortcut="L"
                disabled={busy}
                onClick={focusLabelSearch}
              />
            </div>
          )}
        </section>

        {/* The clip's labels now */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Tooltip title="Labels this snippet had before this suggestion: made by hand, accepted earlier, or copied automatically from another model's snippet.">
            <span className="cursor-help text-fs-11 font-semibold uppercase tracking-wider text-gray-500 font-ibm-sans">
              Already on this {tgtLen.toFixed(0)} s snippet
            </span>
          </Tooltip>
          {c.target_labels.length === 0 ? (
            <span className="text-xs text-gray-400">no labels yet</span>
          ) : (
            c.target_labels.map((l) => (
              <Tag key={l} color="blue" className="m-0 text-xs font-semibold">
                {l}
                {l.toLowerCase() === c.label.toLowerCase() && (
                  <span className="ml-1 font-normal opacity-70">
                    {recheck ? "· to recheck" : "· same as suggestion"}
                  </span>
                )}
              </Tag>
            ))
          )}
        </div>

        {/* Relabel: the hub's own picker; one pick = one relabel */}
        <div
          ref={labelAreaRef}
          className="min-h-[180px]"
          hidden={recheck}
        >
          <LabelSelector
            compact
            value={[]}
            onChange={(labels) => {
              const picked = labels[labels.length - 1];
              if (picked)
                void session.decide("relabel", {
                  input: "mouse",
                  label: picked,
                });
            }}
            disabled={busy || !!outcome}
            quickLabels={quickLabels}
            labelsLoading={quickLabelsLoading}
            placeholder="Relabel: find a label, or search GBIF…"
          />
        </div>
      </div>
    </div>
  );
};

ShareReviewPanel.displayName = "ShareReviewPanel";
