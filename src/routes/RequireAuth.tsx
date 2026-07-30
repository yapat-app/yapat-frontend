import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser } from "../redux/features/authSlice";

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const dispatch = useAppDispatch();
  const { user, accessToken } = useAppSelector((s) => s.auth);
  const [attempted, setAttempted] = useState(false);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (user) {
      setAttempted(true);
      return;
    }
    if (!accessToken) {
      setAttempted(true);
      return;
    }
    // Token present but no user yet — resolve it before anything else runs.
    if (requestedRef.current) return;
    requestedRef.current = true;
    dispatch(getLoggedInUser(accessToken as any)).finally(() =>
      setAttempted(true),
    );
  }, [user, accessToken, dispatch]);

  // No session → login.
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated and user resolved → render the page.
  if (user) {
    return children;
  }

  // Token present, still resolving the user → block the page (and its API
  // calls) behind a loader.
  if (!attempted) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Spin size="large" />
      </div>
    );
  }

  // Resolved but still no user (fetch failed / invalid token) → login.
  return <Navigate to="/login" replace />;
}
