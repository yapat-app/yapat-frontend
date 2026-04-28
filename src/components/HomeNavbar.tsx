import { Button } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getLoggedInUser } from "../redux/features/authSlice";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import DFKI_logo from "../assets/react.svg";

// import React from "react";

export const HomeNavbar = () => {
  const navigator = useNavigate();
  const dispatch = useAppDispatch();
  const { accessToken } = useAppSelector((state) => state.auth);

  const navigateTab = (url: string) => {
    navigator(url);
  };

  useEffect(() => {
    if (accessToken) {
      dispatch(getLoggedInUser());
    }
  }, [accessToken]);
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
          <div className="nav_tabs" onClick={() => navigateTab("/docs")}>
            Documentation
          </div>
        </div>
        <div id="orgLogos" className="flex gap-4 items-center">
          <Button
            onClick={() => {
              navigator("/login");
            }}
            // asChild
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Login
            {/* <Link href="/login">Login</Link> */}
          </Button>
          <div>
            <img className="nav_logo_dfki" src={DFKI_logo}></img>
          </div>
        </div>
      </div>
    </div>
  );
};
