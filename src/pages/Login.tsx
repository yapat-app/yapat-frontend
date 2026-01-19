import { Input, Button } from "antd";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
// import { useDispatch, useSelector } from "react-redux";
import { loginAsync, registerAsync } from "../redux/features/authSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import DFKI_logo from "../../src/assets/Logos/dfki_Logo_digital_black.png";

export const Login = () => {
  const dispatch = useAppDispatch();
  const navigator = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("invitation_token");
  const { loginSuccess, registerSuccess } = useAppSelector(
    (state: any) => state.auth,
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    if (invitationToken) {
      console.log("invitationToken", invitationToken);
      setRole("team_owner");
    }
  }, [invitationToken]);

  useEffect(() => {
    if (loginSuccess) {
      navigator("/datasets");
    }
    if (registerSuccess) {
      navigator("/");
    }
  }, [loginSuccess, registerSuccess]);

  const onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "username") {
      setUsername(value);
    } else if (name === "password") {
      setPassword(value);
    }
  };

  const login = (e: any) => {
    e.preventDefault();
    dispatch(
      loginAsync({
        username: username,
        password: password,
      }),
    );
  };

  const register = (e: any) => {
    e.preventDefault();
    dispatch(
      registerAsync({
        username: username,
        password: password,
        role: role,
        invitation_token: invitationToken,
      }),
    );
  };

  return (
    <div className=" h-full max-h-full">
      <div>
        <img className="nav_logo_dfki" src={DFKI_logo}></img>
      </div>
      <div className=" w-full   min-h-[80%]  flex items-center justify-center">
        <form className=" w-1/4" onSubmit={role ? register : login}>
          <h1 className="text-center font-ibm-sans main_heading_text">YAPAT</h1>
          <div>
            <p className=" font-ibm-sans input_heading_text">Username</p>
            <Input
              style={{
                height: "fit-content",
                flex: 1,
                fontFamily: "IBM Plex Sans, sans-serif",
                margin: "0px 0px 10px 0px",
                padding: "10px",
                backgroundColor: "#F7FBFF",
                color: "#8897AD",
              }}
              id="username"
              name="username"
              value={username}
              type="text"
              placeholder={"Enter Username"}
              onChange={onValueChange}
            />
          </div>
          <div>
            <p className=" font-ibm-sans input_heading_text">Password</p>
            <Input
              style={{
                height: "fit-content",
                flex: 1,
                fontFamily: "IBM Plex Sans, sans-serif",
                margin: "0px 0px 10px 0px",
                padding: "10px",
                backgroundColor: "#F7FBFF",
                color: "#8897AD",
              }}
              name="password"
              id="password"
              type="password"
              value={password}
              placeholder={"Enter Password"}
              onChange={onValueChange}
              // onChange={onValidationChange}
            />
          </div>
          {invitationToken && (
            <div>
              <p className=" font-ibm-sans input_heading_text">Role</p>
              <Input
                disabled
                style={{
                  height: "fit-content",
                  flex: 1,
                  fontFamily: "IBM Plex Sans, sans-serif",
                  margin: "0px 0px 10px 0px",
                  padding: "10px",
                  backgroundColor: "#F7FBFF",
                  color: "#8897AD",
                }}
                name="role"
                id="role"
                type="text"
                value={role}
              />
            </div>
          )}
          <Button
            htmlType="submit"
            style={{
              width: "100%",
              color: "white",
              backgroundColor: "#162D3A",
              fontFamily: "IBM Plex Sans, sans-serif",
              padding: "20px",
            }}
          >
            {role ? "Register " : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
};
