import React, { useEffect, useState } from "react";
import { Button, ConfigProvider, Popover, Radio, Slider, Tooltip } from "antd";
import {
  CloseOutlined,
  InfoCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useDatasetSpectrogramConfig } from "../../hooks/useDatasetSpectrogramConfig";
import { useSpectrogramPrefs } from "../../hooks/useSpectrogramPrefs";
import { formatSpectrogramHz } from "../../utils/spectrogramConfig";
import {
  DEFAULT_SPECTROGRAM_PREFS,
  SPECTROGRAM_COLORMAPS,
  SPECTROGRAM_RANGE_DB_MAX,
  SPECTROGRAM_RANGE_DB_MIN,
  SPECTROGRAM_WINDOW_CHOICES_MS,
  isDefaultSpectrogramPrefs,
  spectrogramPrefsKey,
  type SpectrogramPrefs,
} from "../../utils/spectrogramPrefs";

const PRESETS: Array<{
  label: string;
  min: number | null;
  max: number | null;
}> = [
  { label: "Default", min: null, max: null },
  { label: "0–11 kHz", min: 0, max: 11000 },
  { label: "0–8 kHz", min: 0, max: 8000 },
];

/** How long to wait after the last change before redrawing the preview. */
const PREVIEW_DELAY_MS = 300;

/** One or two plain sentences per setting, shown behind its (i). */
const HELP: Record<string, string> = {
  frequency:
    "The pitch of the sound: low pitches at the bottom of the picture, high pitches at the top. Narrow the range to zoom in on where your species calls.",
  contrast:
    "How much quiet sound you see next to the loudest. Lower: only loud sounds, a cleaner picture. Higher: more detail, but more noise.",
  colour: "Only changes the colours. The sound itself is not changed.",
  window:
    "Shorter: sharper timing. Longer: sharper pitch. 25 ms is the default.",
};

/** Both sliders share this look: blue track, light rail, blue handle. */
const SLIDER_THEME = {
  components: {
    Slider: {
      trackBg: "#2563eb",
      trackHoverBg: "#1d4ed8",
      railBg: "#e2e8f0",
      railHoverBg: "#cbd5e1",
      handleColor: "#2563eb",
      handleActiveColor: "#1d4ed8",
      handleSize: 8,
      handleSizeHover: 8,
      handleLineWidth: 4,
      handleLineWidthHover: 4,
    },
  },
} as const;

const Group: React.FC<{
  title: string;
  /** Current value, shown at the right of the heading. */
  value?: string;
  help: string;
  children: React.ReactNode;
}> = ({ title, value, help, children }) => (
  <section className="flex flex-col gap-[7px]">
    <h4 className="m-0 flex items-center gap-1 text-fs-11 font-medium tracking-[0.08em] text-slate-500 font-ibm-mono uppercase">
      {title}
      <Tooltip
        title={help}
        placement="left"
        styles={{
          root: { maxWidth: 240 },
          container: { fontSize: 11, lineHeight: 1.5, padding: "6px 9px" },
        }}
      >
        <InfoCircleOutlined
          tabIndex={0}
          role="img"
          aria-label={`About ${title.toLowerCase()}`}
          className="text-fs-11 text-slate-400 hover:text-blue-600 cursor-help"
        />
      </Tooltip>
      {value && (
        <span className="ml-auto normal-case tracking-normal text-fs-11 font-normal text-slate-700">
          {value}
        </span>
      )}
    </h4>
    {children}
  </section>
);

interface PanelProps {
  datasetId: number | null;
  /** Highest frequency the recording contains (half its sample rate), if known. */
  maxHz?: number;
  onClose: () => void;
}

const SettingsPanel: React.FC<PanelProps> = ({ datasetId, maxHz, onClose }) => {
  const { savedPrefs, savePrefs, resetPrefs, previewPrefs, isDefault } =
    useSpectrogramPrefs();
  const dataset = useDatasetSpectrogramConfig(datasetId);
  const [draft, setDraft] = useState<SpectrogramPrefs>(savedPrefs);

  const customRange = draft.fMinHz !== null || draft.fMaxHz !== null;
  const changed =
    spectrogramPrefsKey(draft) !== spectrogramPrefsKey(savedPrefs);
  const hasDatasetRange =
    dataset?.spectrogram_f_max_hz != null && dataset.spectrogram_f_max_hz > 0;
  const datasetDefault = hasDatasetRange
    ? `${formatSpectrogramHz(dataset?.spectrogram_f_min_hz ?? 0)}–${formatSpectrogramHz(dataset?.spectrogram_f_max_hz ?? 0)}`
    : "full band";

  const patch = (p: Partial<SpectrogramPrefs>) =>
    setDraft((d) => ({ ...d, ...p }));

  // The slider ends at the recording's highest frequency when that is known.
  // Otherwise it spans 0 Hz to a round number above anything chosen so far
  // (24 kHz by default; it grows for ultrasonic datasets).
  const datasetMaxHz = dataset?.spectrogram_f_max_hz ?? 0;
  const recordingMaxHz = maxHz ? Math.floor(maxHz / 100) * 100 : 0;
  const sliderMaxHz =
    recordingMaxHz >= 200
      ? recordingMaxHz
      : Math.ceil(Math.max(24000, draft.fMaxHz ?? 0, datasetMaxHz) / 1000) *
        1000;
  const sliderValue: [number, number] = [
    Math.min(
      draft.fMinHz ??
        (hasDatasetRange ? (dataset?.spectrogram_f_min_hz ?? 0) : 0),
      sliderMaxHz - 100,
    ),
    Math.min(
      draft.fMaxHz ?? (hasDatasetRange ? datasetMaxHz : sliderMaxHz),
      sliderMaxHz,
    ),
  ];

  // Live preview: what you pick is drawn on screen straight away (after a short
  // pause, so dragging a slider doesn't redraw on every pixel). Nothing is
  // saved until Apply; closing the panel puts the saved look back.
  useEffect(() => {
    const t = window.setTimeout(
      () => previewPrefs(changed ? draft : null),
      PREVIEW_DELAY_MS,
    );
    return () => window.clearTimeout(t);
  }, [draft, changed, previewPrefs]);
  useEffect(() => () => previewPrefs(null), [previewPrefs]);

  return (
    <ConfigProvider theme={SLIDER_THEME}>
      <div
        className="w-[340px] font-ibm-sans"
        data-testid="spectrogram-settings"
      >
        <div className="flex items-center gap-2 py-2.5 pl-3.5 pr-2 border-b border-slate-100">
          <h3 className="m-0 flex-1 text-sm font-semibold font-ibm-mono text-slate-800">
            Spectrogram settings
          </h3>
          <Button
            type="text"
            size="small"
            aria-label="Close settings"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        </div>

        <div className="flex flex-col gap-3.5 px-3.5 pt-3 pb-3.5 max-h-[70vh] overflow-y-auto">
          <Group
            title="Frequency"
            help={HELP.frequency}
            value={
              customRange
                ? `${formatSpectrogramHz(sliderValue[0])} – ${formatSpectrogramHz(sliderValue[1])}`
                : datasetDefault
            }
          >
            <div
              className="flex gap-1.5"
              role="group"
              aria-label="Frequency presets"
            >
              {PRESETS.map((p) => {
                const active = draft.fMinHz === p.min && draft.fMaxHz === p.max;
                return (
                  <Button
                    key={p.label}
                    size="small"
                    shape="round"
                    type={active ? "primary" : "default"}
                    aria-pressed={active}
                    title={
                      p.min === null
                        ? hasDatasetRange
                          ? `This dataset's range (${datasetDefault})`
                          : "The full band of each recording"
                        : undefined
                    }
                    className="h-[26px]! px-2.5! text-fs-12!"
                    onClick={() => patch({ fMinHz: p.min, fMaxHz: p.max })}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
            <div
              className="px-1"
              // Arrow keys move the slider, not the feed's snippet.
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Slider
                range
                min={0}
                max={sliderMaxHz}
                step={100}
                value={sliderValue}
                marks={{}}
                tooltip={{ formatter: (v) => formatSpectrogramHz(v ?? 0) }}
                onChange={(v) => {
                  const [lo, hi] = v as [number, number];
                  patch({ fMinHz: lo, fMaxHz: Math.max(hi, lo + 100) });
                }}
                className="my-1.5!"
              />
              <div className="flex justify-between text-fs-10 text-slate-400 font-ibm-mono select-none">
                <span>0</span>
                <span>{formatSpectrogramHz(sliderMaxHz)}</span>
              </div>
            </div>
          </Group>

          <Group title="Contrast" help={HELP.contrast}>
            <div
              className="grid grid-cols-[minmax(0,1fr)_30px] items-center gap-2"
              // Arrow keys move the slider, not the feed's snippet.
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Slider
                min={SPECTROGRAM_RANGE_DB_MIN}
                max={SPECTROGRAM_RANGE_DB_MAX}
                step={1}
                value={draft.rangeDb}
                tooltip={{ formatter: (v) => `${v} dB` }}
                onChange={(v) => patch({ rangeDb: v })}
                className="my-1.5!"
                aria-label="Range in dB"
              />
              <span className="text-right text-fs-13 font-ibm-mono text-slate-800">
                {draft.rangeDb}
              </span>
            </div>
          </Group>

          <Group title="Colour" help={HELP.colour}>
            {/* Native radios inside labels: styled with plain elements, so they
              keep working with the keyboard and need no button styling. */}
            <div
              role="radiogroup"
              aria-label="Colour scheme"
              className="grid grid-cols-5 gap-[5px]"
            >
              {SPECTROGRAM_COLORMAPS.map((c) => (
                <label key={c.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="spectrogram-colormap"
                    value={c.id}
                    checked={draft.colormap === c.id}
                    onChange={() => patch({ colormap: c.id })}
                    className="peer sr-only"
                  />
                  <span className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-1 pt-1 pb-[5px] hover:bg-slate-50 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400">
                    <span
                      className="h-3 rounded-[3px] border border-slate-900/10"
                      style={{ background: c.gradient }}
                    />
                    <span className="text-center text-fs-11 font-medium text-slate-700">
                      {c.label}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Group>

          <Group title="Window size" help={HELP.window}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              value={draft.windowMs}
              onChange={(e) => patch({ windowMs: e.target.value })}
              options={SPECTROGRAM_WINDOW_CHOICES_MS.map((ms) => ({
                label: `${ms} ms`,
                value: ms,
              }))}
              className="flex [&_.ant-radio-button-wrapper]:flex-1 [&_.ant-radio-button-wrapper]:h-7! [&_.ant-radio-button-wrapper]:text-center [&_.ant-radio-button-wrapper]:text-fs-13! [&_.ant-radio-button-wrapper]:leading-[26px]! [&_.ant-radio-button-wrapper]:font-ibm-mono!"
            />
          </Group>
        </div>

        <div className="flex flex-col gap-2 px-3.5 pt-2.5 pb-3 border-t border-slate-100 bg-slate-50 rounded-b-lg">
          <div className="flex items-center gap-2">
            <Button
              type="link"
              size="small"
              className="px-1! text-fs-13!"
              disabled={isDefault && isDefaultSpectrogramPrefs(draft)}
              onClick={() => {
                resetPrefs();
                setDraft(DEFAULT_SPECTROGRAM_PREFS);
              }}
            >
              Reset to default
            </Button>
            <div className="flex-1" />
            <Button
              type="primary"
              className="h-8! px-4! text-fs-13!"
              onClick={() => {
                savePrefs(draft);
                onClose();
              }}
            >
              Apply
            </Button>
          </div>
          <p className="m-0 text-fs-11 text-slate-500" role="status">
            {changed
              ? "Previewing on screen · Apply to keep it, or close to undo"
              : "Saved on this device · applies to snippets and full recording"}
          </p>
        </div>
      </div>
    </ConfigProvider>
  );
};

interface Props {
  datasetId: number | null;
  /** Highest frequency of the current recording, if known (caps the slider). */
  maxHz?: number;
}

/** Gear button + popover; sits next to "Find similar" in the snippet header. */
export const SpectrogramSettingsPopover: React.FC<Props> = ({
  datasetId,
  maxHz,
}) => {
  const [open, setOpen] = useState(false);
  // Bumped on every open so the panel starts from the saved settings again.
  const [openCount, setOpenCount] = useState(0);
  const { isDefault, previewPrefs } = useSpectrogramPrefs();

  const close = () => {
    previewPrefs(null);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((n) => n + 1);
        else previewPrefs(null);
        setOpen(next);
      }}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      // The panel draws its own header and footer edge to edge.
      styles={{ container: { padding: 0, overflow: "hidden" } }}
      // Never empty: antd ignores open requests from a Popover with no content.
      content={
        <SettingsPanel
          key={openCount}
          datasetId={datasetId}
          maxHz={maxHz}
          onClose={close}
        />
      }
    >
      {/* The Popover needs a plain element to attach to; the hint lives inside
          it and stays out of the way while the panel is open. */}
      <span className="inline-flex">
        <Tooltip
          title="Spectrogram settings"
          placement="topRight"
          open={open ? false : undefined}
        >
          <Button
            size="small"
            aria-label="Spectrogram settings"
            aria-expanded={open}
            icon={<SettingOutlined />}
            type={open ? "primary" : "default"}
            ghost={open}
            className={isDefault ? "" : "text-blue-600! border-blue-300!"}
          />
        </Tooltip>
      </span>
    </Popover>
  );
};
