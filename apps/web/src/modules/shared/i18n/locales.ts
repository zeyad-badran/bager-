/**
 * Supported locales and text direction.
 *
 * Module:   shared (i18n)
 * Serves:   FR-18 (localization: translation, RTL) · blueprint §3.2 (English + Arabic are
 *           candidate first languages, still a PROPOSAL), CLAUDE.md "i18n from day one"
 * Protects: every layout can ask "which direction?" from one place, so right-to-left
 *           support is not bolted on later.
 */

/** Launch locales. Adding one here forces a translation entry in `messages.ts` (compile error otherwise). */
export const LOCALES = ["en", "ar"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type TextDirection = "ltr" | "rtl";

/**
 * Locale tag format accepted by the database (`branches_locale_format`,
 * `profiles_preferred_locale_format`): two lowercase letters, optional `-XX` region.
 * Keep this identical to the SQL check constraints.
 */
export const LOCALE_TAG_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Languages written right-to-left. Compared against the language part of a locale tag. */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "he", "fa", "ur"]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** True when `value` is a well-formed locale tag such as `en` or `ar-JO`. */
export function isLocaleTag(value: unknown): value is string {
  return typeof value === "string" && LOCALE_TAG_PATTERN.test(value);
}

/**
 * Text direction for any locale tag, including regional ones (`ar-JO` is RTL).
 * Unknown or malformed input is treated as left-to-right.
 */
export function getDirection(localeTag: string): TextDirection {
  const language = localeTag.split("-")[0]?.toLowerCase() ?? "";
  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}

/**
 * Pick the best supported locale for a tag (`ar-JO` -> `ar`), falling back to the default.
 */
export function resolveLocale(localeTag: string | null | undefined): Locale {
  const language = localeTag?.split("-")[0]?.toLowerCase();
  return isLocale(language) ? language : DEFAULT_LOCALE;
}
