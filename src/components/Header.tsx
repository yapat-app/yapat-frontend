import { type ReactElement } from "react";
import { Logo } from "./Logo";

export const Header = (): ReactElement => {
  return (
    <div>
      <div>
        <Logo />
      </div>
    </div>
  );
};
