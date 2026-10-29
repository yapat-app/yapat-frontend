/**
 * ResizableLabelBar — the feed's bottom label bar with a drag handle on its top
 * edge. It keeps its original default size; dragging the handle up gives the
 * quick labels more room, dragging down gives the spectrogram more. The feed's
 * cards measure their scroll container, so they shrink/grow with it.
 */

import React, { useEffect, useRef, useState } from "react";
import { studyLogger } from "../../studyLogging";

interface Props {
  children: React.ReactNode;
  className?: string;
}

// Default size: the bar's original content-driven bounds, so the default
// layout is unchanged until the user drags the handle.
const DEFAULT_MIN_HEIGHT = "min(24%, 220px)";
const DEFAULT_MAX_HEIGHT = "clamp(200px, 34%, 290px)";
// Drag bounds: the bar never collapses below a usable strip, and always leaves
// the spectrogram at least this much of the column.
const MIN_PX = 96;
const MIN_FEED_PX = 220;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export const ResizableLabelBar: React.FC<Props> = ({ children, className }) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  // null = default size. Intentionally not persisted, like ResizableSplit.
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number; max: number } | null>(
    null,
  );

  const maxFor = (columnH: number) => Math.max(MIN_PX, columnH - MIN_FEED_PX);

  // Keep a user-chosen height valid when the window gets shorter.
  useEffect(() => {
    if (heightPx === null) return;
    const onResize = () => {
      const columnH = barRef.current?.parentElement?.clientHeight ?? 0;
      if (columnH > 0) setHeightPx((h) => (h === null ? h : clamp(h, MIN_PX, maxFor(columnH))));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [heightPx === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startH: bar.getBoundingClientRect().height,
      max: maxFor(bar.parentElement?.clientHeight ?? 0),
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Dragging up (smaller clientY) makes the label bar taller.
    setHeightPx(clamp(d.startH + (d.startY - e.clientY), MIN_PX, d.max));
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const h = barRef.current?.getBoundingClientRect().height;
    if (h) {
      studyLogger.log("split_resize", {
        mode: "label_bar_px",
        value: Math.round(h),
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      });
    }
  };

  const sizeStyle: React.CSSProperties =
    heightPx === null
      ? { minHeight: DEFAULT_MIN_HEIGHT, maxHeight: DEFAULT_MAX_HEIGHT }
      : { height: heightPx };

  return (
    <div
      ref={barRef}
      className={["relative shrink-0 flex flex-col", className ?? ""].join(" ")}
      style={sizeStyle}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize label panel — double-click to reset"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setHeightPx(null)}
        className="group relative shrink-0 h-2 cursor-row-resize"
      >
        {/* Plain divider line, like the panel splitters; darkens on hover. */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-200 group-hover:h-0.5 group-hover:bg-gray-400" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 pb-3 laptop:px-3!">
        {children}
      </div>
    </div>
  );
};
