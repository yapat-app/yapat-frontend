import React from "react";

import fallbackLogoUrl from "../assets/react.svg?url";

type Props = {
  className?: string;
  alt?: string;
};

export const Logo: React.FC<Props> = ({ className = "", alt = "Logo" }) => {
  const classes = ["nav_logo_dfki", className].filter(Boolean).join(" ");
  // A small copy of the logo (about 280 px wide, ~20 KB) instead of the 1.2 MB
  // original: it is shown at roughly 70 px, and the header should not wait on it.
  const src = "/dfki_Logo_nav.jpg";

  return (
    <img
      className={classes}
      src={src}
      alt={alt}
      loading="eager"
      decoding="sync"
      // React 18 only knows the lowercase attribute name.
      {...({ fetchpriority: "high" } as Record<string, string>)}
      draggable={false}
      onError={(e) => {
        // If the public asset is missing in a given deployment,
        // gracefully fall back to the bundled placeholder.
        (e.currentTarget as HTMLImageElement).src = fallbackLogoUrl;
      }}
    />
  );
};

