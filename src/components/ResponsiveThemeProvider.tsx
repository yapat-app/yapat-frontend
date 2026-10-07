import type { ReactNode } from "react";
import { ConfigProvider } from "antd";
import { useLaptopViewport } from "../hooks/useLaptopViewport";

export const ResponsiveThemeProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const laptop = useLaptopViewport();
  return (
    <ConfigProvider
      theme={
        laptop
          ? {
              token: {
                fontSize: 12,
                controlHeight: 28,
                controlHeightSM: 22,
                controlHeightLG: 34,
              },
            }
          : { token: { fontSize: 13, controlHeight: 30 } }
      }
    >
      {children}
    </ConfigProvider>
  );
};
