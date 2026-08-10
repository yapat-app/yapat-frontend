/**
 * Resolves the current user's authority over a team for the label-space UI:
 * - platform admins are treated as owners of every team (no membership needed);
 * - other users are owners only of teams where their membership role is "owner".
 *
 * `isOwner` is `null` while the membership lookup is in flight (so callers can
 * show a loading state instead of flashing the wrong panel). Keyed by teamId so
 * switching teams re-resolves without a synchronous setState inside the effect.
 */
import { useEffect, useState } from "react";
import { useAppSelector } from "../hooks";
import { teamApi } from "../services/api";
import type { TeamMember } from "../types";

export interface TeamOwnership {
  /** Platform admin (owner interface for every team). */
  isAdmin: boolean;
  /** True = owner/admin, false = plain member, null = still resolving. */
  isOwner: boolean | null;
  /** Resolved to a plain (non-owner, non-admin) member. */
  isPlainMember: boolean;
  /** Ownership still being determined. */
  loading: boolean;
}

export function useTeamOwnership(teamId?: number): TeamOwnership {
  const { user } = useAppSelector((s) => s.auth);
  const isAdmin = user?.role === "admin";

  const [ownerInfo, setOwnerInfo] = useState<{
    teamId: number;
    isOwner: boolean;
  } | null>(null);

  const membershipOwner =
    teamId != null && ownerInfo?.teamId === teamId ? ownerInfo.isOwner : null;
  const isOwner: boolean | null = isAdmin ? true : membershipOwner;

  useEffect(() => {
    if (isAdmin) return;
    if (teamId == null || user?.id == null) return;
    let cancelled = false;
    teamApi
      .getTeamMembers(teamId)
      .then((mem: TeamMember[]) => {
        if (cancelled) return;
        const me = mem.find((m) => m.user_id === user.id);
        setOwnerInfo({ teamId, isOwner: me?.role === "owner" });
      })
      .catch(() => {
        if (!cancelled) setOwnerInfo({ teamId, isOwner: false });
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, user?.id, isAdmin]);

  return {
    isAdmin,
    isOwner,
    isPlainMember: isOwner === false,
    loading: isOwner === null,
  };
}
