import { useEffect, useState } from "react";

type Options = IntersectionObserverInit & {
  /** Default: "400px 0px" */
  rootMargin?: string;
};

/** Parse CSS margin shorthand (1–4 values) into pixel offsets. */
function parseRootMargin(margin: string): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const parts = margin
    .trim()
    .split(/\s+/)
    .map((p) => Number.parseFloat(p) || 0);
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

/** Mirrors IntersectionObserver visibility for scroll containers and the viewport. */
export function isElementInViewport(
  element: Element,
  options: { root?: Element | null; rootMargin?: string } = {},
): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  const margin = parseRootMargin(options.rootMargin ?? "400px 0px");
  const root = options.root ?? null;

  let top: number;
  let left: number;
  let bottom: number;
  let right: number;

  if (root instanceof Element) {
    const r = root.getBoundingClientRect();
    top = r.top - margin.top;
    left = r.left - margin.left;
    bottom = r.bottom + margin.bottom;
    right = r.right + margin.right;
  } else {
    top = 0 - margin.top;
    left = 0 - margin.left;
    bottom = window.innerHeight + margin.bottom;
    right = window.innerWidth + margin.right;
  }

  return (
    rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right
  );
}

export function useInViewport(
  element: Element | null,
  options: Options = {},
): boolean {
  const [inView, setInView] = useState(false);
  const root = options.root ?? null;
  const rootMargin = options.rootMargin ?? "400px 0px";
  const threshold = options.threshold ?? 0;

  useEffect(() => {
    if (!element) {
      setInView(false);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    let cancelled = false;
    const scrollRoot = root instanceof Element ? root : null;

    const sync = () => {
      if (!cancelled) {
        setInView(isElementInViewport(element, { root: scrollRoot, rootMargin }));
      }
    };

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { root, rootMargin, threshold },
    );

    obs.observe(element);
    // One immediate synchronous check avoids a "not loaded yet" flash on
    // first mount (IntersectionObserver's own first callback can lag a
    // frame or two). Beyond that, rely on the observer's async callback —
    // it doesn't force layout. Re-checking via chained rAFs here did
    // (getBoundingClientRect twice more), which is real per-mount cost
    // during fast scrolling when many cards mount in quick succession.
    sync();

    const resizeObs =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(sync)
        : null;
    resizeObs?.observe(element);
    if (scrollRoot) resizeObs?.observe(scrollRoot);

    return () => {
      cancelled = true;
      obs.disconnect();
      resizeObs?.disconnect();
    };
  }, [element, root, rootMargin, threshold]);

  return inView;
}
