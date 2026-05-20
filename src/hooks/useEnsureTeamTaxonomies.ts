/**
 * Ensures custom taxonomies for a team are loaded into Redux (at most one API call per team).
 */
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getAllTaxonomies } from "../redux/features/customTaxonomySlice";

export function useEnsureTeamTaxonomies(
  teamId?: number | null,
  enabled = true,
): void {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const taxonomiesStatus = useAppSelector(
    (s) => s.customTaxonomy.taxonomiesStatus,
  );
  const resolvedTeamId =
    teamId ?? (user?.team_ids?.length ? user.team_ids[0] : null);

  useEffect(() => {
    if (!enabled || resolvedTeamId == null) return;
    void dispatch(getAllTaxonomies(resolvedTeamId));
  }, [dispatch, resolvedTeamId, enabled, taxonomiesStatus]);
}
