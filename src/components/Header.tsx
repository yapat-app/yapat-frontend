import { type ReactElement } from "react";
import DFKI_logo from "../assets/react.svg";

export const Header = (): ReactElement => {
  return (
    <div>
      <div>
        <img className="nav_logo_dfki" src={DFKI_logo}></img>
      </div>
    </div>
  );
};
