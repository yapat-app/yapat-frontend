/**
 * External YAPAT documentation site.
 * Dev: the locally served docs (port 8001). Prod: the GitHub Pages deployment.
 * Override with VITE_DOCS_URL if the docs live elsewhere.
 */
export const DOCS_URL: string =
  import.meta.env.VITE_DOCS_URL ||
  (import.meta.env.DEV
    ? "http://localhost:8001/index.html"
    : "https://yapat-app.github.io/YAPAT/");

export const openDocs = () => {
  window.open(DOCS_URL, "_blank", "noopener,noreferrer");
};
