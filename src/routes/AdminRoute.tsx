import { Navigate } from "react-router-dom";
import { useAppSelector } from "../hooks";

/**
 * Guards admin-only pages (e.g. /admin/users). Mirrors TeamOwnerRedirect's
 * pattern: redirect once we know the user isn't allowed, but don't block
 * rendering while the user is still loading (NavigationBar's getLoggedInUser
 * effect fills it in shortly after mount) -- the backend enforces the real
 * access control regardless (get_current_admin_user), this is purely UX.
 */
export default function AdminRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, user } = useAppSelector((state: any) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Only redirect once the user is loaded and known not to be an admin.
  if (user && user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
