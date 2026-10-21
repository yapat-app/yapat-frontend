/**
 * Label of a header text link. The text turns bold on hover and on the current
 * page; an invisible bold copy sits in the same grid cell so the link already
 * has its bold width, and nothing moves when the weight changes.
 */
export const NavLinkLabel = ({ children }: { children: string }) => (
  <span className="inline-grid">
    <span
      aria-hidden="true"
      className="invisible col-start-1 row-start-1 font-semibold"
    >
      {children}
    </span>
    <span className="col-start-1 row-start-1">{children}</span>
  </span>
);
