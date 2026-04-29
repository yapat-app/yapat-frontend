import React from "react";

import fallbackLogoUrl from "../assets/react.svg?url";

type Props = {
  className?: string;
  alt?: string;
};

export const Logo: React.FC<Props> = ({ className = "", alt = "Logo" }) => {
  const classes = ["nav_logo_dfki", className].filter(Boolean).join(" ");
  const src = "/dfki_Logo.jpg";

  return (
    <img
      className={classes}
      src={src}
      alt={alt}
      onError={(e) => {
        // If the public asset is missing in a given deployment,
        // gracefully fall back to the bundled placeholder.
        (e.currentTarget as HTMLImageElement).src = fallbackLogoUrl;
      }}
    />
  );
};

