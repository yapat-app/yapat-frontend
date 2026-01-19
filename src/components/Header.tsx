import { type ReactElement } from "react";
import DFKI_logo from "../../src/assets/Logos/dfki_Logo_digital_black.png";

export const Header = (): ReactElement => {
  return (
    <div>
      <div>
        <img className="nav_logo_dfki" src={DFKI_logo}></img>
      </div>
    </div>
  );
};
