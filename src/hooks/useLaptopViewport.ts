import { useSyncExternalStore } from "react";

export const LAPTOP_MEDIA_QUERY = "(max-width: 1600px), (max-height: 920px)";

function getMql(): MediaQueryList | null {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(LAPTOP_MEDIA_QUERY)
    : null;
}

function subscribe(onChange: () => void) {
  const mql = getMql();
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

export function useLaptopViewport(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getMql()?.matches ?? false,
    () => false,
  );
}
