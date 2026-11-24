/**
 * ResizableLabelBar — the feed's label panel with a drag handle on the edge it
 * shares with the spectrogram. It sits below the spectrogram by default, or
 * beside it when the feed is wide. Dragging the handle gives the quick labels
 * more room or the spectrogram more; the feed's cards measure their scroll
 * container, so they shrink/grow with it.
 */

import React, { useEffect, useRef, useState } from "react";
import { studyLogger } from "../../studyLogging";

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Dim the bar and make it unusable (e.g. while a listen-only view is open). */
  locked?: boolean;
  /** Where the panel sits relative to the spectrogram. */
  side?: "bottom" | "right";
}

// Default size: the bar's original content-driven bounds, so the default
// layout is unchanged until the user drags the handle.
const DEFAULT_MIN_HEIGHT = "min(24%, 220px)";
const DEFAULT_MAX_HEIGHT = "clamp(200px, 34%, 290px)";
// Drag bounds: the bar never collapses below a usable strip, and always leaves
// the spectrogram at least this much of the column.
const MIN_PX = 96;
const MIN_FEED_PX = 220;
// The same, for the panel beside the spectrogram.
const DEFAULT_SIDE_WIDTH_PX = 360;
const MIN_SIDE_WIDTH_PX = 280;
const MIN_FEED_WIDTH_PX = 720;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export const ResizableLabelBar: React.FC<Props> = ({
  children,
  className,
  locked = false,
  side = "bottom",
}) => {
  const isSide = side === "right";
  const barRef = useRef<HTMLDivElement | null>(null);
  // null = default size. Intentionally not persisted, like ResizableSplit.
  // Kept per side, so switching layout and back restores each one.
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [widthPx, setWidthPx] = useState<number | null>(null);
  const dragRef = useRef<{
    startPos: number;
    startSize: number;
    max: number;
  } | null>(null);

  const minSize = isSide ? MIN_SIDE_WIDTH_PX : MIN_PX;
  const maxFor = (parentSize: number) =>
    isSide
      ? Math.max(MIN_SIDE_WIDTH_PX, parentSize - MIN_FEED_WIDTH_PX)
      : Math.max(MIN_PX, parentSize - MIN_FEED_PX);
  const parentSize = () => {
    const parent = barRef.current?.parentElement;
    return (isSide ? parent?.clientWidth : parent?.clientHeight) ?? 0;
  };
  const setSize = isSide ? setWidthPx : setHeightPx;
  const hasCustomSize = (isSide ? widthPx : heightPx) !== null;

  // Keep a user-chosen size valid when the available space gets smaller.
  useEffect(() => {
    if (!hasCustomSize) return;
    const onResize = () => {
      const available = parentSize();
      if (available > 0) {
        setSize((s) => (s === null ? s : clamp(s, minSize, maxFor(available))));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hasCustomSize, isSide]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointerPos = (e: React.PointerEvent) =>
    isSide ? e.clientX : e.clientY;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = bar.getBoundingClientRect();
    dragRef.current = {
      startPos: pointerPos(e),
      startSize: isSide ? rect.width : rect.height,
      max: maxFor(parentSize()),
    };
    document.body.style.cursor = isSide ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Dragging up (or left, beside the spectrogram) makes the panel bigger.
    setSize(clamp(d.startSize + (d.startPos - pointerPos(e)), minSize, d.max));
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const rect = barRef.current?.getBoundingClientRect();
    const size = isSide ? rect?.width : rect?.height;
    if (size) {
      studyLogger.log("split_resize", {
        mode: isSide ? "label_bar_width_px" : "label_bar_px",
        value: Math.round(size),
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      });
    }
  };

  const sizeStyle: React.CSSProperties = isSide
    ? { width: widthPx ?? DEFAULT_SIDE_WIDTH_PX }
    : heightPx === null
      ? { minHeight: DEFAULT_MIN_HEIGHT, maxHeight: DEFAULT_MAX_HEIGHT }
      : { height: heightPx };

  return (
    <div
      ref={barRef}
      className={[
        "relative shrink-0 flex",
        isSide ? "flex-row min-h-0" : "flex-col",
        className ?? "",
        locked ? "opacity-50 select-none" : "",
      ].join(" ")}
      style={sizeStyle}
      // `inert` blocks pointer and keyboard use of everything inside. React 18
      // has no typing for it, but passes the attribute through to the DOM.
      {...(locked ? ({ inert: "" } as Record<string, string>) : {})}
    >
      <div
        role="separator"
        aria-orientation={isSide ? "vertical" : "horizontal"}
        aria-label="Resize label panel — double-click to reset"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setSize(null)}
        className={[
          "group relative shrink-0",
          isSide ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize",
        ].join(" ")}
      >
        {/* Plain divider line, like the panel splitters; darkens on hover. */}
        <div
          className={
            isSide
              ? "absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200 group-hover:w-0.5 group-hover:bg-gray-400"
              : "absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-200 group-hover:h-0.5 group-hover:bg-gray-400"
          }
        />
      </div>
      <div
        className={[
          "flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden",
          isSide ? "pl-3 pr-5 pt-5 pb-4 laptop:pr-4!" : "px-4 pb-3 laptop:px-3!",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
};
