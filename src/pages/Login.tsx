import { Input, Button } from "antd";
import React from "react";

export const Login = () => {
  return (
    <div className=" h-full max-h-full">
      <div>
        <img
          className="nav_logo_dfki"
          src="/src/assets/Logos/dfki_Logo_digital_black.png"
        ></img>
      </div>
      <div className=" w-full   min-h-[80%]  flex items-center justify-center">
        <form className=" w-1/4">
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
              id="pipeline-name"
              // value={pipelineName}
              type="text"
              placeholder={"Enter Username"}
              // onChange={(e) => setPipelineName(e.target.value)}
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
              id="pipeline-name"
              type="password"
              // value={pipelineName}
              placeholder={"Enter Password"}
              // onChange={(e) => setPipelineName(e.target.value)}
            />
          </div>
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
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
};
