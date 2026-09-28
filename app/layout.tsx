import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1c1a" },
  ],
};

const THEMES = new Set(["light", "dark"]);
const TEXT_SIZES = new Set(["small", "large", "xlarge"]);

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("theme")?.value;
  const textSize = jar.get("text-size")?.value;
  return (
    <html
      lang="en"
      data-theme={theme && THEMES.has(theme) ? theme : undefined}
      data-text-size={textSize && TEXT_SIZES.has(textSize) ? textSize : undefined}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-[10px] focus:bg-paper-raised focus:px-4 focus:py-2 focus:shadow-[var(--shadow-float)]"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
