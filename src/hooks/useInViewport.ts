import { useEffect, useState } from "react";

type Options = IntersectionObserverInit & {
  /** Default: "400px 0px" */
  rootMargin?: string;
};

export function useInViewport(
  element: Element | null,
  options: Options = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(Boolean(entry?.isIntersecting));
      },
      {
        root: options.root ?? null,
        rootMargin: options.rootMargin ?? "400px 0px",
        threshold: options.threshold ?? 0,
      },
    );

    obs.observe(element);
    return () => obs.disconnect();
  }, [element, options.root, options.rootMargin, options.threshold]);

  return inView;
}

