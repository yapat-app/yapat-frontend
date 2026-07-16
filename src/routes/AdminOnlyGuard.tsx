import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser } from "../redux/features/authSlice";

/**
 * Route guard that allows only admin users through.
 * Non-admins are redirected to /dashboard.
 * Shows a spinner while the user is still loading.
 */
export default function AdminOnlyGuard({
  children,
}: {
  children: JSX.Element;
}) {
  const dispatch = useAppDispatch();
  const { user, accessToken } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (accessToken && !user) {
      dispatch(getLoggedInUser(accessToken as any));
    }
  }, [accessToken, user, dispatch]);

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
