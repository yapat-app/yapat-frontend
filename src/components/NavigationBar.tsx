import { Button } from "antd";
import { TbLogout } from "react-icons/tb";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser, logout } from "../redux/features/authSlice";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import DFKI_logo from "../assets/logos/dfki_Logo_digital_black.png";

// import React from "react";

export const NavigationBar = () => {
  const navigator = useNavigate();
  const dispatch = useAppDispatch();
  const { accessToken, isAuthenticated, user } = useAppSelector(
    (state) => state.auth,
  );

  const navigateTab = (url: string) => {
    navigator(url);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigator("/login");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (accessToken) {
      dispatch(getLoggedInUser());
    }
  }, [accessToken]);
  const userlogout = () => {
    dispatch(logout());
    navigator("/login");
  };
  return (
    <div className="flex w-full items-center justify-between py-2  px-8 border-b border-[#E5E8EB] bg-[#FFFFFF]">
      <div>
        <h2 className="text-lg font-bold font-ibm-mono">YAPAT</h2>
      </div>
      <div className="flex gap-5">
        <div
          id="tabs"
          className="flex items-center text-sm font-medium font-ibm-sans gap-4  "
        >
          <div className="nav_tabs" onClick={() => navigateTab("/datasets")}>
            Datasets
          </div>
          <div className="nav_tabs" onClick={() => navigateTab("/annotate")}>
            Annotate
          </div>
          <div className="nav_tabs" onClick={() => navigateTab("/history")}>
            Feed History
          </div>
          {user && (user.role === "admin" || user.role === "team_owner") && (
            <div className="nav_tabs" onClick={() => navigateTab("/teams")}>
              Teams
            </div>
          )}
          <div
            className="nav_tabs"
            onClick={() => navigateTab("/pre-annotation")}
          >
            Pre annotation
          </div>
          <div className="nav_tabs" onClick={() => navigateTab("/docs")}>
            Documentation
          </div>
        </div>
        <div id="orgLogos" className="flex gap-4 items-center">
          <div>
            <img className="nav_logo_dfki" src={DFKI_logo}></img>
          </div>

          <Button
            onClick={userlogout}
            className="bg-[#E8EDF5]!"
            icon={<TbLogout className="h-5 w-5" />}
          ></Button>
          {/* <TbLogout className="h-[20px] w-[20px] " /> */}
          {/* </Button> */}
        </div>
      </div>
    </div>
  );
};
