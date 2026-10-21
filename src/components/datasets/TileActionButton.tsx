/**
 * TileActionButton — the one small action button used in the header of every
 * "Annotation setup" tile (Set range, Manage, Edit), so they share size,
 * border, colour and alignment.
 */

import type { ReactNode } from "react";
import { Button } from "antd";

export const TileActionButton = ({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) => (
  <Button
    size="small"
    icon={icon}
    onClick={onClick}
    className="h-7! rounded-md! border-dashed! border-blue-400! px-2.5! text-xs! font-medium! text-blue-600! hover:bg-blue-50! hover:border-blue-500!"
  >
    {children}
  </Button>
);

/** Fixed-height header row shared by the setup tiles so labels line up. */
export const TILE_HEADER_CLASS =
  "flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1";
