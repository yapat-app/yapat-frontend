import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";
import { DoubleLeftOutlined, DoubleRightOutlined } from "@ant-design/icons";
import { studyLogger } from "../../studyLogging";

type Mode = "ratio" | "right_px" | "left_px";

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
  /** If set, the initial width is this fraction of the container width instead of initialRightPx. */
  initialRightRatio?: number;
  minRightPanelPx?: number;
  maxRightPanelPx?: number;
  /** Optional cap as a fraction of the container width (e.g. 0.4 = 40%) — re-applied on window resize too, not just while dragging. */
  maxRightRatio?: number;

  /** left_px mode: left panel fixed width in px */
  initialLeftPx?: number;
  /** If set, the initial width is this fraction of the container width instead of initialLeftPx. */
  initialLeftRatio?: number;
  minLeftPanelPx?: number;
  maxLeftPanelPx?: number;
  /** Optional cap as a fraction of the container width (e.g. 0.3 = 30%) — re-applied on window resize too, not just while dragging. */
  maxLeftRatio?: number;

  /**
   * When provided (left_px / right_px only), the handle also acts as a
   * collapse toggle: a plain click (pointerdown+up with negligible
   * movement) calls this instead of resizing, and a small chevron is shown
   * on the handle reflecting `collapsed`. The caller owns the boolean and
   * decides how collapsed state affects layout elsewhere; this component
   * just renders the fixed-width panel at 0px while collapsed.
   */
  collapsed?: boolean;
  onToggleCollapse?: () => void;

  className?: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Pointer movement below this (px) between down and up is treated as a
// click (collapse toggle) rather than a resize drag.
const CLICK_MOVE_THRESHOLD_PX = 4;
// Keeps the flexible side from being squeezed to nothing by an aggressive
// fixed-side max/ratio on a narrow viewport.
const MIN_FLEX_SIDE_RESERVE_PX = 120;

export const ResizableSplit: React.FC<ResizableSplitProps> = ({
  left,
  right,
  mode = "ratio",
  initialRatio = 0.5,
  minLeftPx = 360,
  minRightPx = 360,
  initialRightPx = 560,
  initialRightRatio,
  minRightPanelPx = 420,
  maxRightPanelPx = 900,
  maxRightRatio,
  initialLeftPx = 272,
  initialLeftRatio,
  minLeftPanelPx = 220,
  maxLeftPanelPx = 480,
  maxLeftRatio,
  collapsed = false,
  onToggleCollapse,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [ratio, setRatio] = useState<number>(initialRatio);

  const [rightPx, setRightPx] = useState<number>(() => {
    const base =
      initialRightRatio && typeof window !== "undefined"
        ? window.innerWidth * initialRightRatio
        : initialRightPx;
    return maxRightRatio && typeof window !== "undefined"
      ? Math.min(base, window.innerWidth * maxRightRatio)
      : base;
  });

  const [leftPx, setLeftPx] = useState<number>(() => {
    const base =
      initialLeftRatio && typeof window !== "undefined"
        ? window.innerWidth * initialLeftRatio
        : initialLeftPx;
    return maxLeftRatio && typeof window !== "undefined"
      ? Math.min(base, window.innerWidth * maxLeftRatio)
      : base;
  });
  // Note: intentionally NOT persisted. Refresh resets to defaults.

  // Re-clamp against ratio caps whenever the viewport resizes (not just
  // while actively dragging), so "at most X%" keeps holding if the window
  // is made narrower after the panel size was set.
  //
  // Deliberately uses window.innerWidth here, NOT this instance's own
  // container width. Two ResizableSplit instances can be nested (the
  // sidebar split wraps a workspace area that itself contains the
  // projection/feed split) — dragging the outer one changes the inner
  // one's container width as a normal side effect of flex layout, and
  // fireResize() below broadcasts a real "resize" event on every drag
  // pixel so charts etc. redraw. If this effect measured its own
  // container, dragging the sidebar would shrink the inner split's cap
  // (since its container just got narrower) and the feed panel would
  // shrink along with it — exactly the "not independent" bug reported.
  // window.innerWidth is the one reference both splits can share without
  // depending on each other's current layout.
  useEffect(() => {
    const onWindowResize = () => {
      if (mode === "right_px" && maxRightRatio) {
        setRightPx((cur) => Math.min(cur, window.innerWidth * maxRightRatio));
      }
      if (mode === "left_px" && maxLeftRatio) {
        setLeftPx((cur) => Math.min(cur, window.innerWidth * maxLeftRatio));
      }
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [mode, maxRightRatio, maxLeftRatio]);

  const startXRef = useRef(0);
  const movedRef = useRef(false);
  // Per-instance drag flag — NOT a shared/global flag. Two ResizableSplit
  // instances can be mounted at once (e.g. the sidebar split and the
  // projection/feed split); a global flag would make dragging either
  // instance's handle also resize the other, since both would see the same
  // "dragging" signal and both compute a resize from the same pointer event.
  const activeRef = useRef(false);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    movedRef.current = false;
    activeRef.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let dragging = false;
    let latestValue =
      mode === "ratio" ? ratio : mode === "right_px" ? rightPx : leftPx;
    let raf = 0;
    const fireResize = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        window.dispatchEvent(new Event("resize"));
      });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!activeRef.current) {
        if (dragging) {
          dragging = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          fireResize();
        }
        return;
      }
      dragging = true;
      if (Math.abs(e.clientX - startXRef.current) > CLICK_MOVE_THRESHOLD_PX) {
        movedRef.current = true;
      }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      if (w <= 0) return;
      if (mode === "ratio") {
        const minL = minLeftPx / w;
        const minR = minRightPx / w;
        const next = clamp(x / w, minL, 1 - minR);
        latestValue = next;
        setRatio(next);
      } else if (mode === "right_px") {
        // maxRightRatio is a fraction of the viewport (window.innerWidth),
        // not of this split's own container — see the comment on the
        // ratio-reclamp effect above for why.
        const maxR = Math.min(
          maxRightPanelPx,
          maxRightRatio ? window.innerWidth * maxRightRatio : Infinity,
          w - MIN_FLEX_SIDE_RESERVE_PX,
        );
        const nextRight = clamp(w - x, minRightPanelPx, maxR);
        latestValue = nextRight;
        setRightPx(nextRight);
      } else {
        const maxL = Math.min(
          maxLeftPanelPx,
          maxLeftRatio ? window.innerWidth * maxLeftRatio : Infinity,
          w - MIN_FLEX_SIDE_RESERVE_PX,
        );
        const nextLeft = clamp(x, minLeftPanelPx, maxL);
        latestValue = nextLeft;
        setLeftPx(nextLeft);
      }
      fireResize();
    };
    window.addEventListener("pointermove", onPointerMove);
    const onPointerUp = () => {
      const wasActive = activeRef.current;
      activeRef.current = false;
      if (dragging) {
        studyLogger.log("split_resize", {
          mode,
          value: Math.round(latestValue * 1000) / 1000,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
        });
      }
      if (wasActive && !movedRef.current && onToggleCollapse) {
        onToggleCollapse();
      }
      movedRef.current = false;
      fireResize();
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [
    mode,
    minLeftPx,
    minRightPx,
    minRightPanelPx,
    maxRightPanelPx,
    maxRightRatio,
    minLeftPanelPx,
    maxLeftPanelPx,
    maxLeftRatio,
    onToggleCollapse,
  ]);

  const effectiveRightPx = mode === "right_px" && collapsed ? 0 : rightPx;
  const effectiveLeftPx = mode === "left_px" && collapsed ? 0 : leftPx;

  const leftStyle: React.CSSProperties =
    mode === "ratio"
      ? { flexBasis: `${Math.round(ratio * 1000) / 10}%` }
      : mode === "left_px"
        ? { flex: "0 0 auto", width: effectiveLeftPx, overflow: "hidden" }
        : { flex: "1 1 auto", minWidth: 0 };

  const rightStyle: React.CSSProperties =
    mode === "right_px"
      ? { flex: "0 0 auto", width: effectiveRightPx, overflow: "hidden" }
      : { flex: "1 1 auto", minWidth: 0 };

  const showChevron =
    Boolean(onToggleCollapse) && (mode === "left_px" || mode === "right_px");
  const collapseIsToTheLeft = mode === "left_px";
  const pointsRight = collapseIsToTheLeft ? collapsed : !collapsed;

  return (
    <div
      ref={containerRef}
      className={["flex w-full h-full overflow-hidden", className ?? ""].join(
        " ",
      )}
    >
      <div className="min-w-0 h-full overflow-hidden" style={leftStyle}>
        {left}
      </div>

      {(() => {
        const handle = (
          <div
            data-rs-handle="1"
            onPointerDown={startDrag}
            className={[
              "cursor-col-resize shrink-0 relative group",
              collapsed && showChevron ? "w-6" : "w-2",
              "bg-linear-to-r from-gray-50 to-gray-100",
              "hover:from-gray-100 hover:to-gray-200",
            ].join(" ")}
            role="separator"
            aria-orientation="vertical"
            aria-label={
              onToggleCollapse
                ? collapsed
                  ? "Expand panel"
                  : "Resize panel — click to collapse"
                : "Resize panels"
            }
            tabIndex={0}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-300/70 group-hover:bg-gray-400" />
            {showChevron && (
              <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
                <div
                  className={[
                    "flex items-center justify-center rounded-full border shadow-sm transition-opacity",
                    collapsed
                      ? "h-9 w-5 border-blue-200 bg-blue-50 text-blue-500 opacity-100"
                      : "h-8 w-2 border-gray-200 bg-white/90 text-gray-400 opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                >
                  {pointsRight ? (
                    <DoubleRightOutlined className="text-[8px]" />
                  ) : (
                    <DoubleLeftOutlined className="text-[8px]" />
                  )}
                </div>
              </div>
            )}
          </div>
        );
        return showChevron ? (
          <Tooltip title={collapsed ? "Expand" : "Collapse"} placement="right">
            {handle}
          </Tooltip>
        ) : (
          handle
        );
      })()}

      <div className="min-w-0 h-full overflow-hidden" style={rightStyle}>
        {right}
      </div>
    </div>
  );
};
