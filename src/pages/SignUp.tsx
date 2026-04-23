import { Button, Input, message } from "antd";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearError, registerAsync, resetAuth } from "../redux/features/authSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import DFKI_logo from "../assets/logos/dfki_Logo_digital_black.png";

export const SignUp = () => {
  const dispatch = useAppDispatch();
  const navigator = useNavigate();

  const { registerSuccess, loginLoading, error } = useAppSelector(
    (state: any) => state.auth,
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (registerSuccess) {
      navigator("/login");
      message.success("Registration successful! Try logging in.");
      dispatch(resetAuth());
    }
  }, [registerSuccess]);

  useEffect(() => {
    if (error) {
      message.error(error, undefined, () => {
        dispatch(clearError());
      });
    }
  }, [error]);

  const onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "username") setUsername(value);
    if (name === "password") setPassword(value);
  };

  const register = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(
      registerAsync({
        username,
        password,
        role: "user",
        team_invitation_token: null,
      }),
    );
  };

  return (
    <div className="flex h-screen flex-col ">
      <div>
        <img className="nav_logo_dfki" src={DFKI_logo}></img>
      </div>
      <div className=" w-full  h-full flex items-center justify-center">
        <form className=" w-1/4" onSubmit={register}>
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
            <Input.Password
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
              value={password}
              placeholder={"Enter Password"}
              onChange={onValueChange}
              visibilityToggle
            />
          </div>
          <Button
            loading={loginLoading}
            htmlType="submit"
            style={{
              width: "100%",
              color: "white",
              backgroundColor: "#162D3A",
              fontFamily: "IBM Plex Sans, sans-serif",
              padding: "20px",
            }}
          >
            Sign Up
          </Button>
        </form>
      </div>
    </div>
  );
};
