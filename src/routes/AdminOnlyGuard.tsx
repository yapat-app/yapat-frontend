import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAppSelector } from "../hooks";

/**
 * Route guard that allows only admin users through.
 * Non-admins are redirected to /dashboard.
 * Shows a spinner while the user is still loading.
 */
export default function AdminOnlyGuard({ children }: { children: JSX.Element }) {
  const { user, accessToken } = useAppSelector((state) => state.auth);

  // Still waiting for user data to load
  if (accessToken && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
