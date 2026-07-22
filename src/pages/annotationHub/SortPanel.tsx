import React, { useState } from "react";
import { Tooltip } from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  DownOutlined,
  SortAscendingOutlined,
} from "@ant-design/icons";
import type { SortField, SortableProperty } from "../../types/sort";
import { getAvailableSortOptions, makeSortFieldId } from "./sortPanelHelpers";
import { propertyColor } from "../../constants/alProperties";

interface SortPanelProps {
  fields: SortField[];
  onChange: (fields: SortField[]) => void;
  allowNonModel: boolean;
  allowModel: boolean;
  disabled?: boolean;
}

/**
 * One chip per sortable property, colour-matched to the Model scores sidebar.
 * Tap to cycle: off → descending → ascending → off. Activation order is the
 * sort priority (fields[0] is primary); a number badge shows it when 2+
 * chips are active.
 */
export const SortPanel: React.FC<SortPanelProps> = ({
  fields,
  onChange,
  allowNonModel,
  allowModel,
  disabled = false,
}) => {
  const [open, setOpen] = useState(true);

  if (!allowNonModel && !allowModel) return null;

  const availableOptions = getAvailableSortOptions(allowNonModel, allowModel);
  const activeCount = disabled ? 0 : fields.filter((f) => !f.disabled).length;

  const cycleChip = (property: SortableProperty) => {
    const existing = fields.find((f) => f.property === property);
    if (!existing) {
      onChange([
        ...fields,
        { id: makeSortFieldId(), property, direction: "desc" },
      ]);
    } else if (existing.direction === "desc") {
      onChange(
        fields.map((f) =>
          f.id === existing.id ? { ...f, direction: "asc" } : f,
        ),
      );
    } else {
      onChange(fields.filter((f) => f.id !== existing.id));
    }
  };

  return (
    <div data-tour="sort-panel" className="border-b border-gray-100 bg-white">
      {/*
        A plain div (not a <button>) — native <button> elements have
        inconsistent flexbox layout behavior in some browsers (the trailing
        icon can wrap onto its own line instead of sitting beside the
        label), which is exactly what a real <button> here showed. Matches
        the same div+role="button" pattern already used by
        CollapsibleSection for its header toggle.
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
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left group"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold font-ibm-mono text-gray-700">
          <SortAscendingOutlined className="text-gray-400" />
          Sort
          {activeCount > 0 && (
            <span className="text-[11px] font-normal text-gray-400 font-ibm-sans">
              · {activeCount} field{activeCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <DownOutlined
          className={[
            "text-[10px] text-gray-400 transition-transform duration-200",
            open ? "" : "-rotate-90",
          ].join(" ")}
        />
      </div>
      <div
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3">
            <div className="flex flex-wrap gap-1">
              {availableOptions.map((opt) => {
                const field = fields.find((f) => f.property === opt.value);
                const isActive = Boolean(field) && !opt.disabled;
                // Priority = position among active fields (1-based).
                const priority = field
                  ? fields
                      .filter((f) => !f.disabled)
                      .findIndex((f) => f.id === field.id) + 1
                  : 0;
                const color = propertyColor(opt.value);

                if (disabled || opt.disabled) {
                  return (
                    <Tooltip
                      key={opt.value}
                      title={
                        disabled
                          ? "Sorting diabled for Phase 3"
                          : "Not available yet"
                      }
                    >
                      <span className="inline-flex shrink-0 cursor-not-allowed items-center whitespace-nowrap rounded-full border border-dashed border-gray-200 px-2 py-0.75 text-[11px] font-medium text-gray-300 font-ibm-sans">
                        {opt.label}
                      </span>
                    </Tooltip>
                  );
                }

                return (
                  <Tooltip
                    key={opt.value}
                    title={
                      !isActive
                        ? "Sort high → low"
                        : field?.direction === "desc"
                          ? "Switch to low → high"
                          : "Remove from sort"
                    }
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => cycleChip(opt.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          cycleChip(opt.value);
                        }
                      }}
                      className={[
                        "inline-flex shrink-0 flex-nowrap cursor-pointer items-center whitespace-nowrap rounded-full border px-2 py-0.75 text-[11px] font-medium font-ibm-sans leading-none transition-colors",
                        isActive
                          ? "border-transparent"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700",
                      ].join(" ")}
                      style={
                        isActive
                          ? { backgroundColor: `${color}17`, color }
                          : undefined
                      }
                    >
                      <span className="inline-flex flex-nowrap items-center gap-1 leading-none">
                        <span className="leading-none">{opt.label}</span>
                        {isActive &&
                          (field?.direction === "asc" ? (
                            <ArrowUpOutlined className="shrink-0 text-[9px] leading-none" />
                          ) : (
                            <ArrowDownOutlined className="shrink-0 text-[9px] leading-none" />
                          ))}
                        {isActive && activeCount > 1 && (
                          <span className="shrink-0 text-[9px] font-semibold leading-none opacity-70">
                            {priority}
                          </span>
                        )}
                      </span>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
            {activeCount > 1 && (
              <p className="mt-1.5 text-[10px] text-gray-400 font-ibm-sans">
                Numbers show sort priority — first chip tapped sorts first.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

SortPanel.displayName = "SortPanel";
