import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchAllDatasets,
  fetchAllTeamDatasets,
} from "../redux/features/datasetSlice";
import { wssedApi } from "../services/api";
import { canAccessWssed } from "../utils/wssedAccess";

export default function WssedAccessGuard({
  children,
}: {
  children: JSX.Element;
}) {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;

    if (user.role === "admin" || user.role === "user") {
      dispatch(fetchAllDatasets());
    } else if (user.role === "team_owner") {
      dispatch(fetchAllTeamDatasets());
    }
  }, [user, dispatch]);

  useEffect(() => {
    if (!user) return;

    if (user.role === "admin") {
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
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- check once per user session
  }, [user]);

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
