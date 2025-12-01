import React, { type ReactElement } from "react";
type HeadingProps = { title: string };

export const Header = ({ title }: HeadingProps): ReactElement => {
  return (
    <div>
      <div>
        <img
          className="nav_logo_dfki"
          src="/src/assets/Logos/dfki_Logo_digital_black.png"
        ></img>
      </div>
    </div>
  );
};
