import { Input, Button, Select, message } from "antd";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
// import { useDispatch, useSelector } from "react-redux";
import {
  checkAdminExistsAsync,
  clearError,
  loginAsync,
  registerAsync,
  resetAuth,
} from "../redux/features/authSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Logo } from "../components/Logo";

export const Login = () => {
  const dispatch = useAppDispatch();
  const navigator = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("token");
  const targetRole = searchParams.get("target_role");

  const { loginSuccess, registerSuccess, loginLoading, error, adminExists } =
    useAppSelector((state: any) => state.auth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  // Registration reachable two ways: via an invitation link (role locked to
  // the invitation's target_role, existing behavior) or manually toggled
  // here with no invitation token at all -- e.g. to create the first admin
  // account on a fresh instance, where there's nobody to send an invite yet.
  const [mode, setMode] = useState<"login" | "register">("login");

  const normalizeRole = (r: string | null | undefined) => {
    if (!r) return "";
    if (r === "owner") return "team_owner";
    return r;
  };

  useEffect(() => {
    if (invitationToken) {
      console.log("invitationToken", invitationToken, targetRole);
      setRole(normalizeRole(targetRole) || "user");
      setMode("register");
    }
  }, [invitationToken]);

  useEffect(() => {
    if (mode === "register" && !invitationToken && !role) {
      setRole("user");
    }
  }, [mode, invitationToken]);

  // Only relevant for the manual (no-invitation) registration path, to
  // decide whether "Admin" should be offered at all -- the backend enforces
  // this regardless (see app/api/auth.py::register), this is purely so the
  // form doesn't dangle a dead-end option in front of someone.
  useEffect(() => {
    if (!invitationToken && adminExists === null) {
      dispatch(checkAdminExistsAsync());
    }
  }, [invitationToken, adminExists]);

  // If "admin" was selected before the check resolved (or resolved to true
  // after selection), don't leave a now-invalid option selected.
  useEffect(() => {
    if (adminExists === true && role === "admin") {
      setRole("user");
    }
  }, [adminExists, role]);

  useEffect(() => {
    if (loginSuccess) {
      navigator("/dashboard");
    }
    if (registerSuccess) {
      navigator("/login");
      setRole("");
      setMode("login");
      message.success("Registration successful! Try logging in.");
      dispatch(resetAuth());
    }
  }, [loginSuccess, registerSuccess]);

  useEffect(() => {
    if (error) {
      message.error(error, undefined, () => {
        dispatch(clearError());
      });
    }
  }, [error]);

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
        team_invitation_token: invitationToken,
      }),
    );
  };

  return (
    <div className="flex h-screen flex-col ">
      <div>
        <Logo />
      </div>
      <div className=" w-full  h-full flex items-center justify-center">
        <form className=" w-1/4" onSubmit={mode === "register" ? register : login}>
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
          {mode === "register" && !invitationToken && (
            <div>
              <p className=" font-ibm-sans input_heading_text">Role</p>
              <Select
                style={{ width: "100%", marginBottom: 10 }}
                value={role || "user"}
                onChange={(value) => setRole(value)}
                options={[
                  { value: "user", label: "User" },
                  { value: "team_owner", label: "Team Owner" },
                  // Admin is only offered before the first admin account
                  // exists -- once one does, this is a dead-end option, the
                  // backend rejects it (app/api/auth.py::register).
                  ...(adminExists === false
                    ? [{ value: "admin", label: "Admin" }]
                    : []),
                ]}
              />
            </div>
          )}
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
            {mode === "register" ? "Register" : "Sign In"}
          </Button>
          {!invitationToken && (
            <p className="text-center font-ibm-sans" style={{ marginTop: 12 }}>
              <a
                onClick={() => {
                  setMode(mode === "register" ? "login" : "register");
                  if (mode === "login") setRole("user");
                }}
                style={{ cursor: "pointer" }}
              >
                {mode === "register"
                  ? "Already have an account? Sign in"
                  : "Don't have an account? Register"}
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
