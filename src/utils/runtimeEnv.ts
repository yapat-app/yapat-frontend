/**
 * Read an env var with a runtime override.
 *
 * `entrypoint.sh` writes the deployment's environment into `window.__ENV__`
 * (via `public/config.js`) at container start, so these values can change
 * without a fresh Vite build. Build-time `import.meta.env` is the fallback for
 * local dev (and for anything not injected at runtime).
 *
 * Note: the entrypoint emits empty strings for unset vars (`${VAR:-}`), so an
 * empty runtime value is treated as "not provided" and falls back to build-time.
 */
export function readEnv(key: string): string | undefined {
  const runtime = (window as unknown as { __ENV__?: Record<string, string> }).__ENV__?.[key];
  if (runtime !== undefined && runtime !== "") return runtime;
  return (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
}

/** Truthy-string check shared across the study env flags. */
export function parseBoolEnv(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}
