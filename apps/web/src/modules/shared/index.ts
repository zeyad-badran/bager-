/**
 * Public API of the `shared` module: small building blocks used by every other module.
 *
 * Module:   shared
 * Serves:   cross-cutting: FR-18 (localization), blueprint §14.1 (validated inputs)
 * Rule:     other modules import from here (`../shared`), never from files inside it.
 */
export { DOMAIN_ERROR_CODES, DomainError, type DomainErrorCode } from "./errors";
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_TAG_PATTERN,
  getDirection,
  isLocale,
  isLocaleTag,
  resolveLocale,
  type Locale,
  type TextDirection,
} from "./i18n/locales";
export { MESSAGES, translate, type MessageKey } from "./i18n/messages";
