/**
 * The locale of the current request, for server components.
 *
 * Module:   app shell (apps/web/src/lib)
 * Serves:   FR-18 (localization, RTL) · slice 01b scope item 3
 * Protects: one place decides the locale, so the layout's `lang`/`dir` and the page text
 *           can never disagree.
 */
import { headers } from "next/headers";
import { localeFromAcceptLanguage, type Locale } from "@/modules/shared";

/** Locale for this request, from Accept-Language (falls back to the default locale). */
export async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  return localeFromAcceptLanguage(requestHeaders.get("accept-language"));
}
