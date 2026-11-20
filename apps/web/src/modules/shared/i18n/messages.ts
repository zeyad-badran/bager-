/**
 * Message catalogues and the `translate` lookup.
 *
 * Module:   shared (i18n)
 * Serves:   FR-18 (localization) · CLAUDE.md "all user-facing strings go through i18n"
 * Protects: a missing translation is a compile error (the Arabic catalogue must have exactly
 *           the English keys), and a runtime miss falls back to English instead of showing a key.
 *
 * TODO(FR-18): the Arabic strings below are PLACEHOLDERS for the skeleton and must be
 * reviewed by a native speaker before any customer sees them.
 */
import { DEFAULT_LOCALE, type Locale } from "./locales";

const en = {
  "common.loading": "Loading…",
  "common.error": "Something went wrong. Please try again.",
  "auth.signIn": "Sign in",
} as const;

export type MessageKey = keyof typeof en;

/** Arabic catalogue. `Record<MessageKey, string>` makes a missing or extra key a compile error. */
const ar: Record<MessageKey, string> = {
  "common.loading": "جارٍ التحميل…",
  "common.error": "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  "auth.signIn": "تسجيل الدخول",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, ar };

/**
 * Look up a message for a locale. Falls back to the default locale if the entry is
 * empty, so users never see a raw key.
 */
export function translate(locale: Locale, key: MessageKey): string {
  const text = MESSAGES[locale][key];
  return text !== "" ? text : MESSAGES[DEFAULT_LOCALE][key];
}
