/**
 * Root layout: sets the document language and text direction for every page.
 *
 * Module:   app shell (apps/web/src/app)
 * Serves:   FR-18 (localization, RTL) · CLAUDE.md "layouts must work LTR and RTL" · slice 01b item 3
 * Protects: `lang` and `dir` come from `shared` (`getDirection`), never hard-coded, so Arabic
 *           pages are right-to-left from the first screen onward.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getDirection, translate } from "@/modules/shared";
import { getRequestLocale } from "@/lib/request-locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, "app.name") };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body className="bg-background text-foreground min-h-screen antialiased">{children}</body>
    </html>
  );
}
