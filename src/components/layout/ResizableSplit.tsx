import React, { useEffect, useRef, useState } from "react";

type Mode = "ratio" | "right_px";

export interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** How resizing is represented */
  mode?: Mode;

  /** Ratio mode: left panel width ratio (0..1) */
  initialRatio?: number;
  minLeftPx?: number;
  minRightPx?: number;

  /** right_px mode: right panel fixed width in px */
  initialRightPx?: number;
  minRightPanelPx?: number;
  maxRightPanelPx?: number;

  className?: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export const ResizableSplit: React.FC<ResizableSplitProps> = ({
  left,
  right,
  mode = "ratio",
  initialRatio = 0.5,
  minLeftPx = 360,
  minRightPx = 360,
  initialRightPx = 560,
  minRightPanelPx = 420,
  maxRightPanelPx = 900,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [ratio, setRatio] = useState<number>(() => {
    if (mode !== "ratio") return initialRatio;
    return initialRatio;
  });

  const [rightPx, setRightPx] = useState<number>(() => {
    if (mode !== "right_px") return initialRightPx;
    return initialRightPx;
  });
  // Note: intentionally NOT persisted. Refresh resets to defaults.

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    (document.body.dataset as any).rsDragging = "1";
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Second effect: tie dragging state to body dataset (so move effect closure can read it).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let dragging = false;
    let raf = 0;
    const fireResize = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        window.dispatchEvent(new Event("resize"));
      });
    };
    const onPointerMove = (e: PointerEvent) => {
      const active = (document.body.dataset as any).rsDragging === "1";
      if (!active) {
        if (dragging) {
          dragging = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          fireResize();
        }
        return;
      }
      dragging = true;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      if (w <= 0) return;
      if (mode === "ratio") {
        const minL = minLeftPx / w;
        const minR = minRightPx / w;
        const next = clamp(x / w, minL, 1 - minR);
        setRatio(next);
      } else {
        const nextRight = clamp(w - x, minRightPanelPx, Math.min(maxRightPanelPx, w - 120));
        setRightPx(nextRight);
      }
      fireResize();
    };
    window.addEventListener("pointermove", onPointerMove);
    const onPointerUp = () => {
      delete (document.body.dataset as any).rsDragging;
      fireResize();
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [mode, minLeftPx, minRightPx, minRightPanelPx, maxRightPanelPx]);

  const leftStyle: React.CSSProperties =
    mode === "ratio"
      ? { flexBasis: `${Math.round(ratio * 1000) / 10}%` }
      : { flex: "1 1 auto", minWidth: 0 };

  const rightStyle: React.CSSProperties =
    mode === "right_px"
      ? { flex: "0 0 auto", width: rightPx }
      : { flex: "1 1 auto", minWidth: 0 };

  return (
    <div ref={containerRef} className={["flex w-full h-full overflow-hidden", className ?? ""].join(" ")}>
      <div className="min-w-0 h-full overflow-hidden" style={leftStyle}>
        {left}
      </div>

      <div
        data-rs-handle="1"
        onPointerDown={startDrag}
        className={[
          "w-2 cursor-col-resize flex-shrink-0 relative group",
          "bg-gradient-to-r from-gray-50 to-gray-100",
          "hover:from-gray-100 hover:to-gray-200",
        ].join(" ")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-gray-300/70 group-hover:bg-gray-400" />
      </div>

      <div className="min-w-0 h-full overflow-hidden" style={rightStyle}>
        {right}
      </div>
    </div>
  );
};

