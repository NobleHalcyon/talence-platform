import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@talence/ui/tokens.css";
import "@talence/ui/base.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Talence",
    template: "%s · Talence",
  },
  description: "Private-beta access to Talence.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#DFE5EA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="tl-skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
