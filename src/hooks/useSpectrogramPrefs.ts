import { useCallback, useSyncExternalStore } from "react";
import { useAppSelector } from "../hooks";
import {
  DEFAULT_SPECTROGRAM_PREFS,
  isDefaultSpectrogramPrefs,
  sanitizeSpectrogramPrefs,
  type SpectrogramPrefs,
} from "../utils/spectrogramPrefs";

/**
 * The annotator's spectrogram display settings, remembered on this device per
 * account. A tiny external store keeps every spectrogram on screen and the
 * settings panel in sync without touching Redux.
 *
 * Besides the saved settings there is a temporary "preview": the settings
 * panel shows its unsaved choices on screen right away, and closing the panel
 * without Apply throws them away. Everything that draws a spectrogram reads
 * the effective value (preview, else saved).
 */

const STORAGE_PREFIX = "yapat_spectrogram_prefs:";

const saved = new Map<string, SpectrogramPrefs>();
const previews = new Map<string, SpectrogramPrefs>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function readSaved(key: string): SpectrogramPrefs {
  const cached = saved.get(key);
  if (cached) return cached;
  let prefs = DEFAULT_SPECTROGRAM_PREFS;
  try {
    const raw = localStorage.getItem(key);
    if (raw) prefs = sanitizeSpectrogramPrefs(JSON.parse(raw));
  } catch {
    // Private mode / blocked storage / corrupt JSON: use the defaults.
  }
  saved.set(key, prefs);
  return prefs;
}

function writeSaved(key: string, prefs: SpectrogramPrefs): void {
  saved.set(key, prefs);
  previews.delete(key);
  try {
    if (isDefaultSpectrogramPrefs(prefs)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Still applies for this session even if it can't be remembered.
  }
  emit();
}

function setPreview(key: string, prefs: SpectrogramPrefs | null): void {
  const had = previews.get(key);
  if (prefs === null) {
    if (had === undefined) return;
    previews.delete(key);
  } else {
    previews.set(key, prefs);
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpectrogramPrefs(): {
  /** What to draw with right now: the preview if one is showing, else the saved settings. */
  prefs: SpectrogramPrefs;
  /** The saved settings only (what Apply wrote). */
  savedPrefs: SpectrogramPrefs;
  savePrefs: (next: SpectrogramPrefs) => void;
  resetPrefs: () => void;
  /** Show unsaved settings on screen; `null` goes back to the saved ones. */
  previewPrefs: (next: SpectrogramPrefs | null) => void;
  /** True when the saved settings are the built-in defaults. */
  isDefault: boolean;
} {
  const userId = useAppSelector((s) => s.auth.user?.id ?? null);
  const key = `${STORAGE_PREFIX}${userId ?? "anonymous"}`;

  const savedPrefs = useSyncExternalStore(
    subscribe,
    () => readSaved(key),
    () => DEFAULT_SPECTROGRAM_PREFS,
  );
  const preview = useSyncExternalStore(
    subscribe,
    () => previews.get(key) ?? null,
    () => null,
  );
  const savePrefs = useCallback(
    (next: SpectrogramPrefs) => writeSaved(key, sanitizeSpectrogramPrefs(next)),
    [key],
  );
  const resetPrefs = useCallback(
    () => writeSaved(key, DEFAULT_SPECTROGRAM_PREFS),
    [key],
  );
  const previewPrefs = useCallback(
    (next: SpectrogramPrefs | null) =>
      setPreview(key, next === null ? null : sanitizeSpectrogramPrefs(next)),
    [key],
  );
  return {
    prefs: preview ?? savedPrefs,
    savedPrefs,
    savePrefs,
    resetPrefs,
    previewPrefs,
    isDefault: isDefaultSpectrogramPrefs(savedPrefs),
  };
}
