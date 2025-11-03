import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/brand";
import { SiteChrome } from "@/ui/site-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Causal Design Instrument`,
  description: "A local-first instrument for stress-testing causal claims before data exists.",
};

const themeScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("theme-preference");
    const theme = stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
