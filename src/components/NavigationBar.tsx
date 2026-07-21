import { Button, Tooltip } from "antd";
import { TbLogout } from "react-icons/tb";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser, logout } from "../redux/features/authSlice";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Logo } from "./Logo";

const NAV_LINKS = [
  { label: "Dashboard", route: "/dashboard" },
  { label: "Documentation", route: "/documentation" },
];

export const NavigationBar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dispatch = useAppDispatch();
  const { accessToken, isAuthenticated, user } = useAppSelector(
    (state) => state.auth,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (accessToken && !user) {
      dispatch(getLoggedInUser());
    }
  }, [accessToken, user, dispatch]);

  const userlogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  const allLinks = NAV_LINKS;

  return (
    <div className="flex w-full items-center justify-between py-2 px-8 border-b border-[#E5E8EB] bg-[#FFFFFF]">
      {/* Brand */}
      <h2
        className="text-lg font-bold font-ibm-mono cursor-pointer select-none hover:opacity-70 transition-opacity"
        onClick={() => navigate("/")}
      >
        YAPAT
      </h2>

      <div className="flex items-center gap-3 ml-auto">
        {/* Nav links */}
        <nav className="flex items-center text-sm font-medium font-ibm-sans gap-1">
          {allLinks.map(({ label, route }) => {
            const isActive =
              route === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(route);
            return (
              <button
                key={route}
                onClick={() => navigate(route)}
                className={`
                  px-3 py-1.5 rounded-md transition-colors duration-150 whitespace-nowrap
                  ${
                    isActive
                      ? "bg-gray-100 text-gray-900 font-semibold"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }
                `}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Right side: logo + user + logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
          <Logo />

          {user && (
            <div className="flex flex-col items-start leading-tight">
              {user.username.length > 10 ? (
                <Tooltip title={user.username} placement="top">
                  <span className="text-sm font-semibold text-gray-800 capitalize max-w-28 truncate cursor-pointer">
                    {user.username.substring(0, 10) + "…"}
                  </span>
                </Tooltip>
              ) : (
                <span className="text-sm font-semibold text-gray-800 capitalize">
                  {user.username}
                </span>
              )}
              <span className="text-xs text-gray-400">
                {user.role === "team_owner" ? "Team owner" : user.role}
              </span>
            </div>
          )}

          <Button
            onClick={userlogout}
            className="bg-[#E8EDF5]!"
            icon={<TbLogout className="h-5 w-5" />}
          />
        </div>
      </div>
    </div>
  );
};
