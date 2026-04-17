import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCS — Ship Equipment Cybersecurity Compliance Assessment System",
  description: "선박 사이버 보안 지원 시스템 — IACS UR E26/E27 규정 준수 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={3000}
          offset={64}
          toastOptions={{
            style: {
              fontFamily: "var(--font-sans)",
              borderRadius: "8px",
            },
          }}
        />
      </body>
    </html>
  );
}
