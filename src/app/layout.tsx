import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { VisitorTracker } from "@/components/visitor-tracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // `template` lets each page name itself - "Sign in | Ziventa Gaushala" -
  // while anything that does not fall back to `default`.
  title: {
    default: "Ziventa Gaushala - A2 Gir Cow Ghee & Panchgavya",
    template: "%s | Ziventa Gaushala",
  },
  description:
    "Small-batch A2 Gir cow bilona ghee and Panchgavya from our own gaushala, with founding membership in the Gir Gold Club.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <VisitorTracker />
      </body>
    </html>
  );
}
