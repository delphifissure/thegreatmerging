import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";

// Newsreader's optical-size axis keeps small reading text sturdy and large headings fine.
const newsreader = Newsreader({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-newsreader", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
};

// Restore the high-contrast preference before first paint so the page does not flash.
const restoreContrast = `try{if(localStorage.getItem("the-plan:high-contrast")==="1"){document.documentElement.classList.add("high-contrast")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${sourceSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: restoreContrast }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-3 focus:py-2 focus:outline focus:outline-2 focus:outline-focus"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
