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

const SITE = "https://girbyziventa.com";
const DESCRIPTION =
  "Small-batch A2 Gir cow bilona ghee and Panchgavya from our own gaushala, with founding membership in the Gir Gold Club.";

export const metadata: Metadata = {
  /**
   * Needed for the share image: Open Graph requires an absolute URL, and
   * without this Next emits a relative one that WhatsApp and Facebook simply
   * ignore, leaving the link with no picture.
   */
  metadataBase: new URL(SITE),
  // `template` lets each page name itself - "Sign in | Ziventa Gaushala" -
  // while anything that does not fall back to `default`.
  title: {
    default: "Ziventa Gaushala - A2 Gir Cow Ghee & Panchgavya",
    template: "%s | Ziventa Gaushala",
  },
  description: DESCRIPTION,
  /**
   * The icons come from src/app: favicon.ico, icon.svg and apple-icon.png are
   * picked up by filename, so they are not listed here. Only the share image
   * has to be declared.
   */
  openGraph: {
    type: "website",
    siteName: "Ziventa Gaushala",
    title: "Ziventa Gaushala - A2 Gir Cow Ghee & Panchgavya",
    description: DESCRIPTION,
    url: SITE,
    locale: "en_IN",
    images: [
      {
        url: "/logo/og-image.png",
        width: 1200,
        height: 630,
        alt: "Ziventa Gaushala - A2 Gir Cow Bilona Ghee and Panchgavya",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ziventa Gaushala - A2 Gir Cow Ghee & Panchgavya",
    description: DESCRIPTION,
    images: ["/logo/og-image.png"],
  },
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
