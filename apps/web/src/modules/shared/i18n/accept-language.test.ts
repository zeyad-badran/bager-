/**
 * Tests for picking a supported locale from an HTTP Accept-Language header.
 *
 * Module:   shared (i18n)
 * Serves:   FR-18 (localization, RTL): the root layout uses this to choose `lang` and `dir`.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { localeFromAcceptLanguage } from "./accept-language";

describe("FR-18 locale from Accept-Language", () => {
  it("picks Arabic for a regional Arabic browser (ar-JO)", () => {
    assert.equal(localeFromAcceptLanguage("ar-JO,ar;q=0.9,en;q=0.8"), "ar");
  });

  it("picks English for an English browser", () => {
    assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9"), "en");
  });

  it("skips unsupported languages and takes the next supported one", () => {
    assert.equal(localeFromAcceptLanguage("fr-FR,fr;q=0.9,ar;q=0.5"), "ar");
  });

  it("honours q-values, not only list order", () => {
    assert.equal(localeFromAcceptLanguage("en;q=0.3,ar;q=0.8"), "ar");
  });

  it("ignores entries with q=0 (explicitly not acceptable)", () => {
    assert.equal(localeFromAcceptLanguage("ar;q=0,en;q=0.1"), "en");
  });

  it("falls back to the default locale for a missing, empty, wildcard or malformed header", () => {
    assert.equal(localeFromAcceptLanguage(null), "en");
    assert.equal(localeFromAcceptLanguage(""), "en");
    assert.equal(localeFromAcceptLanguage("*"), "en");
    assert.equal(localeFromAcceptLanguage(";;;,,q=abc"), "en");
  });
});
