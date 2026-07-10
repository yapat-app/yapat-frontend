import React, { useState } from "react";
import { DownOutlined } from "@ant-design/icons";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  /** Optional trailing content in the header row (e.g. a badge count). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  defaultOpen = true,
  headerExtra,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-gray-100 px-3.5 py-2.5">
      {/*
        A plain div (not a <button>) — headerExtra may itself contain an
        interactive control (e.g. a reset icon button), and buttons can't
        nest. Toggle click/keyboard support is added manually instead.
      */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left group"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 font-ibm-sans group-hover:text-gray-600 transition-colors">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {headerExtra}
          <DownOutlined
            className={[
              "text-[9px] text-gray-400 transition-transform duration-200",
              open ? "" : "-rotate-90",
            ].join(" ")}
          />
        </span>
      </div>
      <div
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr] mt-2" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </section>
  );
};

CollapsibleSection.displayName = "CollapsibleSection";
