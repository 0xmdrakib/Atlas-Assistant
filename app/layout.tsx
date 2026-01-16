import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Atlas Assistant",
  description: "Signal-first personal assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-dvh">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
