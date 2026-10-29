// Open event + permission check for HubQuickLabelsManager, kept out of the
// component file so React fast refresh keeps working there.
import { useAppSelector } from "../../hooks";
import { normalizeUserRole } from "../../utils/normalizeUserRole";

export const OPEN_QUICK_LABELS_MANAGER = "yapat:manage-quick-labels";

export const openQuickLabelsManager = () =>
  window.dispatchEvent(new Event(OPEN_QUICK_LABELS_MANAGER));

/** Same roles as the dataset panel's management actions. */
export function useCanManageQuickLabels(): boolean {
  const role = normalizeUserRole(useAppSelector((s) => s.auth.user?.role));
  return role === "admin" || role === "team_owner";
}
