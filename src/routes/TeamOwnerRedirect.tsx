import { Navigate } from "react-router-dom";
import { useAppSelector } from "../hooks";

export default function TeamOwnerRedirect({
  children,
}: {
  children: JSX.Element;
}) {
  const { user } = useAppSelector((state: any) => state.auth);

  // Only redirect once user is loaded
  if (user && user.role === "team_owner" && user.team_ids?.length > 0) {
    return <Navigate to={`/teams/${user.team_ids[0]}`} replace />;
  }

  // Render children for everyone else OR if user is not loaded yet
  return children;
}
