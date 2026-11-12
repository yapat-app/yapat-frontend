import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, ConfigProvider, Popover, Radio, Slider, Tooltip } from "antd";
import {
  CloseOutlined,
  DownOutlined,
  InfoCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useDatasetSpectrogramConfig } from "../../hooks/useDatasetSpectrogramConfig";
import { useSpectrogramPrefs } from "../../hooks/useSpectrogramPrefs";
import { formatSpectrogramHz } from "../../utils/spectrogramConfig";
import {
  DEFAULT_SPECTROGRAM_PREFS,
  SPECTROGRAM_BOOST_DB_MAX,
  SPECTROGRAM_COLORMAPS,
  SPECTROGRAM_GAIN_DB_MAX,
  SPECTROGRAM_GAIN_DB_MIN,
  SPECTROGRAM_RANGE_DB_MAX,
  SPECTROGRAM_RANGE_DB_MIN,
  SPECTROGRAM_SCALES,
  SPECTROGRAM_WINDOW_CHOICES_MS,
  SPECTROGRAM_ZERO_PAD_CHOICES,
  isDefaultSpectrogramPrefs,
  spectrogramPrefsKey,
  type SpectrogramPrefs,
} from "../../utils/spectrogramPrefs";
import type {
  SpectrogramScale,
  SpectrogramWindowType,
} from "../../utils/spectrogramCompute";

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

/**
 * Wording for every setting. Kept short on purpose: a name people already know,
 * one caption under the chosen option, and (behind the (i)) one or two
 * sentences on when to use it, with the Audacity name for anyone coming from there.
 */
const HELP = {
  frequency:
    "Which pitches are shown: low at the bottom, high at the top. Narrow it to zoom in on where your species calls. (Audacity: Min/Max frequency)",
  scale:
    "How pitches are spread up the picture. Natural (Mel) suits most calls; Even (Linear) gives high-pitched calls, such as insects or bats, more room; Low-end (Log) favours the lowest pitches. (Audacity: Scale)",
  sensitivity:
    "How faint a sound can be and still show. Raise it to reveal quiet calls, with more background noise; lower it for a cleaner picture. (Audacity: Range)",
  colour:
    "Only changes the colours, never the sound. Grayscale suits printing; Jet separates small differences. (Audacity: Scheme)",
  detail:
    "A picture cannot be sharp in both timing and pitch at once. Timing suits clicks and pulses; Pitch suits whistles and steady tones. (Audacity: Window size)",
  brightness:
    "Brightens or dims the whole picture. Brighten to bring out faint calls; loud sounds then saturate. (Audacity: Gain)",
  boost:
    "Lifts high pitches so a faint high call stands out from low rumble. (Audacity: High boost)",
  lineQuality:
    "Small differences in how loud sounds are drawn: Sharp gives thinner lines with more haze, Clean the least haze with thicker lines. (Audacity: Window type)",
  smoothing:
    "Smooths the pitch axis without changing the sound. Subtle, and clearest when zoomed in; higher is slower. (Audacity: Zero padding)",
} as const;

interface ChoiceText {
  label: string;
  /** Under five words: what the chosen option does. */
  caption: string;
}

const SCALE_TEXT: Record<SpectrogramScale, ChoiceText> = {
  mel: {
    label: "Natural",
    caption: "Mel scale · like hearing: low pitches get more room",
  },
  linear: {
    label: "Even",
    caption: "Linear scale · equal room, best for high-pitched calls",
  },
  log: {
    label: "Low-end",
    caption: "Log scale · most room for the lowest pitches",
  },
};

/** Keyed by window length in ms. */
const DETAIL_TEXT: Record<number, ChoiceText> = {
  12: { label: "Timing", caption: "Clicks and pulses look crisper" },
  25: { label: "Balanced", caption: "A good all-round start" },
  50: { label: "Pitch", caption: "Steady notes and whistles look crisper" },
};

/** Shown in this order, from sharpest to cleanest. */
const LINE_QUALITY_ORDER: SpectrogramWindowType[] = [
  "hamming",
  "hann",
  "blackman",
];
const LINE_QUALITY_TEXT: Record<SpectrogramWindowType, ChoiceText> = {
  hamming: { label: "Sharp", caption: "Thinner lines, a little more haze" },
  hann: { label: "Standard", caption: "A good all-round choice" },
  blackman: { label: "Clean", caption: "Least haze, slightly thicker lines" },
};

/** Keyed by the zero-padding factor. */
const SMOOTHING_TEXT: Record<number, ChoiceText> = {
  1: { label: "Off", caption: "Standard detail" },
  2: { label: "Medium", caption: "Smoother, a little slower" },
  4: { label: "High", caption: "Smoothest, slowest to draw" },
};

/** Look of the button rows: equal-width, short plain words. */
const OPTION_BUTTONS_CLASS =
  "flex! w-full! [&_.ant-radio-button-wrapper]:flex-1 [&_.ant-radio-button-wrapper]:h-9! [&_.ant-radio-button-wrapper]:px-2! [&_.ant-radio-button-wrapper]:text-center [&_.ant-radio-button-wrapper]:text-fs-13! [&_.ant-radio-button-wrapper]:leading-[34px]! [&_.ant-radio-button-wrapper]:font-ibm-sans!";

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
  <section className="flex min-w-0 flex-col gap-[6px]">
    <h4 className="m-0 flex items-center gap-1 text-fs-11 font-semibold uppercase tracking-wider text-slate-600 font-ibm-sans">
      {title}
      <Tooltip
        title={help}
        placement="left"
        styles={{
          root: { maxWidth: 250 },
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

/** Button choices with, underneath, a short caption for the chosen one. */
function ChoiceGroup<V extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: V;
  onChange: (v: V) => void;
  options: Array<{ value: V } & ChoiceText>;
  ariaLabel: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Radio.Group
        optionType="button"
        buttonStyle="solid"
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        options={options.map((o) => ({ label: o.label, value: o.value }))}
        className={OPTION_BUTTONS_CLASS}
        aria-label={ariaLabel}
      />
      {current && (
        <p className="m-0 mt-1 text-fs-11 leading-[1.4] text-slate-500">
          {current.caption}
        </p>
      )}
    </>
  );
}

/** A slider with a plain word at each end and its value at the right. */
const SliderRow: React.FC<{
  min: number;
  max: number;
  value: number;
  unit: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  /** Show a + in front of positive values. */
  signed?: boolean;
  onChange: (v: number) => void;
}> = ({
  min,
  max,
  value,
  unit,
  label,
  lowLabel,
  highLabel,
  signed,
  onChange,
}) => {
  const show = (v: number) => (signed && v > 0 ? `+${v}` : `${v}`);
  return (
  <div className="flex flex-col">
    <div
      className="grid grid-cols-[minmax(0,1fr)_34px] items-center gap-2"
      // Arrow keys move the slider, not the feed's snippet.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Slider
        min={min}
        max={max}
        step={1}
        value={value}
        tooltip={{ formatter: (v) => `${show(v ?? 0)} ${unit}` }}
        onChange={onChange}
        className="my-1.5!"
        aria-label={label}
      />
      <span className="text-right text-fs-13 font-ibm-mono text-slate-800">
        {show(value)}
      </span>
    </div>
    <div
      className="mr-[42px] flex justify-between text-fs-10 text-slate-400 font-ibm-sans select-none"
      aria-hidden
    >
      <span>{lowLabel}</span>
      <span>{highLabel}</span>
    </div>
  </div>
  );
};

/** Audacity-style heading that groups related settings (Scale, Colours, Algorithm). */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2" aria-hidden>
      <span className="text-fs-10 font-semibold uppercase tracking-wider text-slate-400 font-ibm-sans">
        {title}
      </span>
      <span className="h-px flex-1 bg-slate-100" />
    </div>
    {children}
  </div>
);

/** Space kept between the card and the button above it / the bottom of the screen. */
const CARD_GAP_PX = 8;
const SCREEN_MARGIN_PX = 16;
/** Never shorter than this, even on a very short window (the card then scrolls). */
const MIN_CARD_HEIGHT_PX = 260;

interface PanelProps {
  datasetId: number | null;
  /** Highest frequency the recording contains (half its sample rate), if known. */
  maxHz?: number;
  /** Tallest the card may be: it scrolls inside instead of running off the screen. */
  maxHeightPx: number;
  onClose: () => void;
}

const SettingsPanel: React.FC<PanelProps> = ({
  datasetId,
  maxHz,
  maxHeightPx,
  onClose,
}) => {
  const { savedPrefs, savePrefs, resetPrefs, previewPrefs, isDefault } =
    useSpectrogramPrefs();
  const dataset = useDatasetSpectrogramConfig(datasetId);
  const [draft, setDraft] = useState<SpectrogramPrefs>(savedPrefs);
  // Open by default so every option is in reach; it can still be folded away.
  const [advancedOpen, setAdvancedOpen] = useState(true);

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
        className="flex w-[340px] flex-col font-ibm-sans"
        style={{ maxHeight: maxHeightPx }}
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

        <div className="flex flex-col gap-3.5 pl-3.5 pr-5 pt-3 pb-3 min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <Section title="Frequency">
            <Group
              title="Frequency range"
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
                aria-label="Frequency range presets"
              >
                {PRESETS.map((p) => {
                  const active =
                    draft.fMinHz === p.min && draft.fMaxHz === p.max;
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

            <Group title="Scale" help={HELP.scale}>
              <ChoiceGroup
                ariaLabel="Scale"
                value={draft.scale}
                onChange={(v) => patch({ scale: v })}
                options={SPECTROGRAM_SCALES.map((c) => ({
                  value: c.id,
                  ...SCALE_TEXT[c.id],
                }))}
              />
            </Group>
          </Section>

          <Section title="Picture">
            <Group title="Sensitivity" help={HELP.sensitivity}>
              <SliderRow
                min={SPECTROGRAM_RANGE_DB_MIN}
                max={SPECTROGRAM_RANGE_DB_MAX}
                value={draft.rangeDb}
                unit="dB"
                label="Sensitivity"
                lowLabel="Cleaner"
                highLabel="More detail"
                onChange={(v) => patch({ rangeDb: v })}
              />
            </Group>

            <Group
              title="Colour scheme"
              help={HELP.colour}
              value={SPECTROGRAM_COLORMAPS.find(
                (c) => c.id === draft.colormap,
              )?.label.replace(/^./, (ch) => ch.toUpperCase())}
            >
              {/* Native radios inside labels: styled with plain elements, so they
              keep working with the keyboard and need no button styling. */}
              <div
                role="radiogroup"
                aria-label="Colour scheme"
                className="grid grid-cols-8 gap-1"
              >
                {SPECTROGRAM_COLORMAPS.map((c) => (
                  <label
                    key={c.id}
                    title={`${c.label.replace(/^./, (ch) => ch.toUpperCase())}: ${c.hint}`}
                    className="cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="spectrogram-colormap"
                      value={c.id}
                      checked={draft.colormap === c.id}
                      onChange={() => patch({ colormap: c.id })}
                      aria-label={c.label}
                      className="peer sr-only"
                    />
                    <span
                      className="block h-6 rounded-md border border-slate-900/10 hover:border-slate-400 peer-checked:ring-2 peer-checked:ring-blue-600 peer-checked:ring-offset-1 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400"
                      style={{ background: c.gradient }}
                    />
                  </label>
                ))}
              </div>
            </Group>
          </Section>

          <Section title="Detail">
            <Group title="Sharper detail in" help={HELP.detail}>
              <ChoiceGroup
                ariaLabel="Sharper detail in"
                value={draft.windowMs}
                onChange={(v) => patch({ windowMs: v })}
                options={SPECTROGRAM_WINDOW_CHOICES_MS.map((ms) => ({
                  value: ms,
                  label: DETAIL_TEXT[ms]?.label ?? `${ms} ms`,
                  caption: DETAIL_TEXT[ms]?.caption ?? "",
                }))}
              />
            </Group>
          </Section>

          <div className="flex flex-col gap-3">
            <Button
              type="text"
              size="small"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex! h-5! items-center! justify-start! gap-2! px-0! text-fs-10! font-semibold! tracking-wider text-slate-400! font-ibm-sans! uppercase hover:bg-transparent! hover:text-slate-600!"
            >
              <span>Fine-tuning</span>
              <span className="h-px flex-1 bg-slate-100" />
              <DownOutlined
                className={`text-[9px] transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
            </Button>

            {advancedOpen && (
              <>
                <Group title="Brightness" help={HELP.brightness}>
                  <SliderRow
                    min={SPECTROGRAM_GAIN_DB_MIN}
                    max={SPECTROGRAM_GAIN_DB_MAX}
                    value={draft.gainDb}
                    unit="dB"
                    label="Brightness"
                    lowLabel="Dim"
                    highLabel="Bright"
                    signed
                    onChange={(v) => patch({ gainDb: v })}
                  />
                </Group>

                <Group title="Boost highs" help={HELP.boost}>
                  <SliderRow
                    min={0}
                    max={SPECTROGRAM_BOOST_DB_MAX}
                    value={draft.highBoostDb}
                    unit="dB/decade"
                    label="Boost highs"
                    lowLabel="Off"
                    highLabel="Strong"
                    onChange={(v) => patch({ highBoostDb: v })}
                  />
                </Group>

                <Group title="Line quality" help={HELP.lineQuality}>
                  <ChoiceGroup
                    ariaLabel="Line quality"
                    value={draft.windowType}
                    onChange={(v) => patch({ windowType: v })}
                    options={LINE_QUALITY_ORDER.map((id) => ({
                      value: id,
                      ...LINE_QUALITY_TEXT[id],
                    }))}
                  />
                </Group>

                <Group title="Smoothing" help={HELP.smoothing}>
                  <ChoiceGroup
                    ariaLabel="Smoothing"
                    value={draft.zeroPad}
                    onChange={(v) => patch({ zeroPad: v })}
                    options={SPECTROGRAM_ZERO_PAD_CHOICES.map((z) => ({
                      value: z,
                      label: SMOOTHING_TEXT[z]?.label ?? `${z}×`,
                      caption: SMOOTHING_TEXT[z]?.caption ?? "",
                    }))}
                  />
                </Group>
              </>
            )}
          </div>
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
  // The card is as tall as the space below the gear allows, with a margin above
  // the bottom of the screen; what does not fit scrolls inside the card.
  const gearRef = useRef<HTMLSpanElement>(null);
  const [maxHeightPx, setMaxHeightPx] = useState(560);
  const fitToScreen = useCallback(() => {
    const gear = gearRef.current;
    if (!gear) return;
    const room =
      window.innerHeight -
      gear.getBoundingClientRect().bottom -
      CARD_GAP_PX -
      SCREEN_MARGIN_PX;
    setMaxHeightPx(Math.max(MIN_CARD_HEIGHT_PX, Math.floor(room)));
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", fitToScreen);
    return () => window.removeEventListener("resize", fitToScreen);
  }, [open, fitToScreen]);
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
        if (next) {
          fitToScreen();
          setOpenCount((n) => n + 1);
        } else previewPrefs(null);
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
          maxHeightPx={maxHeightPx}
          onClose={close}
        />
      }
    >
      {/* The Popover needs a plain element to attach to; the hint lives inside
          it and stays out of the way while the panel is open. */}
      <span ref={gearRef} className="inline-flex">
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
