/**
 * Helpers for the auto-retrain threshold window.
 *
 * The number box labels the platform default as "10 (default)". Picking the
 * default number means "use the default", so it is stored as null rather than
 * as a custom value.
 */

const DEFAULT_LABEL = /\s*\(default\)\s*$/i;

/** Text shown in the number box: the default number carries a "(default)" label. */
export function formatThreshold(
  value: number | string | undefined,
  defaultThreshold: number | null,
  userTyping: boolean,
  input: string,
): string {
  // Leave the text alone while it is being typed.
  if (userTyping) return input;
  if (value === undefined || value === null || value === "") return "";
  if (defaultThreshold !== null && Number(value) === defaultThreshold) {
    return `${value} (default)`;
  }
  return String(value);
}

/** Reads the box's text back as a number string, ignoring the "(default)" label. */
export function parseThreshold(text: string | undefined): string {
  return (text ?? "").replace(DEFAULT_LABEL, "");
}

/** What to send to the server: null (use the default) when empty or equal to it. */
export function thresholdToSave(
  value: number | null | undefined,
  defaultThreshold: number | null,
): number | null {
  if (value === null || value === undefined) return null;
  return defaultThreshold !== null && value === defaultThreshold ? null : value;
}

/** The reset link only helps when the number differs from the default. */
export function canResetThreshold(
  value: number | null | undefined,
  defaultThreshold: number | null,
): boolean {
  // Default unknown (older backend): keep the link, as before.
  if (defaultThreshold === null) return true;
  return value !== null && value !== undefined && value !== defaultThreshold;
}

/** What the box shows when the window opens: the dataset's own value, else the default. */
export function initialThreshold(
  override: number | null | undefined,
  defaultThreshold: number | null,
): number | undefined {
  return override ?? defaultThreshold ?? undefined;
}
