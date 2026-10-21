import { Button, Tooltip } from "antd";
import { TbLogout } from "react-icons/tb";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser, logout } from "../redux/features/authSlice";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { Logo } from "./Logo";
import { navLinkClass } from "./navLinkStyles";
import { NavLinkLabel } from "./NavLinkLabel";
import { openDocs } from "../constants/docs";

const NAV_LINKS = [
  { label: "Dashboard", route: "/dashboard" },
  { label: "Documentation", route: "/documentation" },
];

interface NavigationBarProps {
  /** Page-specific controls shown next to the nav links (e.g. the Guide menu). */
  extra?: ReactNode;
}

export const NavigationBar = ({ extra }: NavigationBarProps = {}) => {
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
    <div className="nav-zoom flex w-full items-center justify-between font-ibm-sans text-gray-900 px-3 max-[359px]:px-2 sm:px-6 border-b border-[#E5E8EB] bg-[#FFFFFF]">
      {/* Brand */}
      <h2
        className="text-lg max-[359px]:text-base font-bold font-ibm-mono cursor-pointer select-none hover:opacity-70 transition-opacity"
        onClick={() => navigate("/")}
      >
        YAPAT
      </h2>

      {/* The bar's vertical padding lives here, so the nav links below can reach
          the bar's bottom edge, where the active / hover line sits. */}
      <div className="flex items-center gap-1 sm:gap-3 ml-auto py-1.5">
        {/* Nav links */}
        <nav className="flex items-center self-stretch -my-1.5 text-sm font-medium font-ibm-sans gap-1">
          {allLinks.map(({ label, route }) => {
            const isActive =
              route === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(route);
            return (
              <button
                key={route}
                onClick={() =>
                  route === "/documentation" ? openDocs() : navigate(route)
                }
                aria-current={isActive ? "page" : undefined}
                className={navLinkClass(isActive)}
              >
                <NavLinkLabel>{label}</NavLinkLabel>
              </button>
            );
          })}
        </nav>

        {extra}

        {/* Right side: logo + user + logout */}
        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-gray-200">
          <span className="hidden sm:block">
            <Logo />
          </span>

          {user && (
            <div className="hidden sm:flex flex-col items-start leading-tight">
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

          <Tooltip title="Logout" placement="bottom">
            <Button
              aria-label="Logout"
              onClick={userlogout}
              className="bg-[#E8EDF5]!"
              icon={<TbLogout className="h-5 w-5" />}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
