import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { fetchAllDatasets } from "../redux/features/datasetSlice";
import { getLoggedInUser } from "../redux/features/authSlice";
import { wssedApi } from "../services/api";
import { canAccessWssed } from "../utils/wssedAccess";

export default function WssedAccessGuard({
  children,
}: {
  children: JSX.Element;
}) {
  const dispatch = useAppDispatch();
  const { user, accessToken } = useAppSelector((state) => state.auth);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // Which user id we have already run the access check for. Redux hands back a
  // fresh `user` object on every auth-slice update, so keying effects on the
  // object itself re-runs them on identity churn alone -- that flips this guard
  // back into `checking`, unmounting and remounting the whole WSSED page, and
  // every remount fires another round of requests. Key on the id instead.
  const userId = user?.id ?? null;
  const userRole = user?.role ?? null;
  const checkedForUserId = useRef<number | string | null>(null);

  useEffect(() => {
    if (!userId && accessToken) {
      dispatch(getLoggedInUser(accessToken as any));
    }
  }, [userId, accessToken, dispatch]);

  useEffect(() => {
    if (!userId) return;

    if (
      userRole === "admin" ||
      userRole === "user" ||
      userRole === "team_owner"
    ) {
      dispatch(fetchAllDatasets());
    }
  }, [userId, userRole, dispatch]);

  useEffect(() => {
    if (!userId || !user) return;

    // Already resolved for this user -- do not re-enter `checking`.
    if (checkedForUserId.current === userId) return;

    if (userRole === "admin") {
      checkedForUserId.current = userId;
      setEnabled(true);
      setChecking(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setChecking(true);
      try {
        const access = await wssedApi.getAccess();
        if (!cancelled) {
          setEnabled(access.enabled);
        }
      } catch {
        if (!cancelled) {
          setEnabled(canAccessWssed(user, allDatasets));
        }
      } finally {
        if (!cancelled) {
          checkedForUserId.current = userId;
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- check once per user id
  }, [userId, userRole]);

  // Not logged in at all — don't spin forever, send to login.
  if (!user && !accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (!user || checking || enabled === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!enabled) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
