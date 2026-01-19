import React, { type ReactElement } from "react";
type HeadingProps = { title: string };
import DFKI_logo from "../../src/assets/Logos/dfki_Logo_digital_black.png";

export const Header = ({ title }: HeadingProps): ReactElement => {
  return (
    <div>
      <div>
        <img className="nav_logo_dfki" src={DFKI_logo}></img>
      </div>
    </div>
  );
};
