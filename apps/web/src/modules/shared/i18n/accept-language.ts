/**
 * Choose the page locale from the browser's Accept-Language header.
 *
 * Module:   shared (i18n)
 * Serves:   FR-18 (localization, RTL) · CLAUDE.md "layouts must work LTR and RTL"
 * Protects: the header is untrusted input; anything unparseable falls back to the default
 *           locale instead of throwing, so a strange browser can never break the page.
 *
 * TODO(FR-18): a signed-in user's `profiles.preferred_locale` and the branch locale should
 * win over the header once those screens exist.
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/** RFC 9110 §12.4.2: a missing q-value means 1 (most preferred). */
const DEFAULT_QUALITY = 1;

type WeightedTag = { language: string; quality: number; position: number };

/** Parse one `tag;q=0.8` entry. Returns null for entries we cannot read. */
function parseEntry(entry: string, position: number): WeightedTag | null {
  const [tagPart, ...params] = entry.split(";");
  const language = tagPart?.trim().split("-")[0]?.toLowerCase() ?? "";
  if (language === "" || language === "*") return null;

  let quality = DEFAULT_QUALITY;
  for (const param of params) {
    const [name, value] = param.split("=").map((part) => part.trim());
    if (name === "q") quality = Number(value);
  }
  return Number.isFinite(quality) ? { language, quality, position } : null;
}

/**
 * The best supported locale for an Accept-Language header value.
 *
 * Entries are ordered by q-value (ties keep header order); entries with q=0 are refused,
 * per RFC 9110. Returns `DEFAULT_LOCALE` when nothing in the header is supported.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const candidates = header
    .split(",")
    .map((entry, position) => parseEntry(entry, position))
    .filter((tag): tag is WeightedTag => tag !== null && tag.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.position - b.position);

  return candidates.map((tag) => tag.language).find(isLocale) ?? DEFAULT_LOCALE;
}
