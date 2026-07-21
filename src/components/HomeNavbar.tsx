import { Button } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser, logout } from "../redux/features/authSlice";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Logo } from "./Logo";

// import React from "react";

export const HomeNavbar = () => {
  const navigator = useNavigate();
  const dispatch = useAppDispatch();
  const { accessToken, isAuthenticated } = useAppSelector(
    (state) => state.auth,
  );

  const navigateTab = (url: string) => {
    navigator(url);
  };

  useEffect(() => {
    if (accessToken) {
      dispatch(getLoggedInUser(accessToken as any));
    }
  }, [accessToken]);
  return (
    <div className="flex w-full items-center justify-between py-2  px-8 border-b border-[#E5E8EB] bg-[#FFFFFF]">
      <div>
        <h2
          className="text-lg font-bold font-ibm-mono cursor-pointer select-none hover:opacity-80"
          onClick={() => navigateTab("/")}
        >
          YAPAT
        </h2>
      </div>
      <div className="flex gap-5">
        <div
          id="tabs"
          className="flex items-center text-sm font-medium font-ibm-sans gap-4  "
        >
          <div
            className="nav_tabs"
            onClick={() => navigateTab("/documentation")}
          >
            Documentation
          </div>
        </div>
        <div id="orgLogos" className="flex gap-4 items-center">
          {isAuthenticated ? (
            <>
              <Button
                onClick={() => navigator("/dashboard")}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Dashboard
              </Button>
              <Button
                onClick={() => {
                  dispatch(logout());
                  navigator("/login");
                }}
                className="bg-[#E8EDF5]!"
              >
                Logout
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                navigator("/login");
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Login
            </Button>
          )}
          <div>
            <Logo />
          </div>
        </div>
      </div>
    </div>
  );
};
