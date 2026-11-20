/**
 * Tests for locale resolution, text direction and message catalogues.
 *
 * Module:   shared (i18n)
 * Serves:   FR-18 (localization, RTL)
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DEFAULT_LOCALE, getDirection, isLocale, isLocaleTag, resolveLocale } from "./locales";
import { MESSAGES, translate } from "./messages";

describe("FR-18 text direction", () => {
  it("Arabic is right-to-left, English is left-to-right", () => {
    assert.equal(getDirection("ar"), "rtl");
    assert.equal(getDirection("en"), "ltr");
  });

  it("regional tags follow their language (ar-JO is RTL, en-GB is LTR)", () => {
    assert.equal(getDirection("ar-JO"), "rtl");
    assert.equal(getDirection("en-GB"), "ltr");
  });

  it("unknown or malformed tags fall back to left-to-right", () => {
    assert.equal(getDirection(""), "ltr");
    assert.equal(getDirection("zz"), "ltr");
  });
});

describe("FR-18 locale resolution", () => {
  it("maps a regional tag to the supported language", () => {
    assert.equal(resolveLocale("ar-JO"), "ar");
  });

  it("falls back to the default for unsupported, empty or missing input", () => {
    assert.equal(resolveLocale("fr"), DEFAULT_LOCALE);
    assert.equal(resolveLocale(""), DEFAULT_LOCALE);
    assert.equal(resolveLocale(null), DEFAULT_LOCALE);
    assert.equal(resolveLocale(undefined), DEFAULT_LOCALE);
  });

  it("isLocale accepts only launch locales", () => {
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("ar"), true);
    assert.equal(isLocale("fr"), false);
    assert.equal(isLocale(42), false);
  });

  it("isLocaleTag matches the database format check (branches_locale_format)", () => {
    for (const ok of ["en", "ar", "ar-JO", "en-GB"]) assert.equal(isLocaleTag(ok), true, ok);
    for (const bad of ["english", "EN", "en_GB", "en-gb", "e", ""]) assert.equal(isLocaleTag(bad), false, bad);
  });
});

describe("FR-18 message catalogues", () => {
  it("every locale has exactly the same keys", () => {
    const expected = Object.keys(MESSAGES.en).sort();
    for (const locale of Object.keys(MESSAGES) as Array<keyof typeof MESSAGES>) {
      assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), expected, `catalogue ${locale}`);
    }
  });

  it("no catalogue entry is empty", () => {
    for (const locale of Object.keys(MESSAGES) as Array<keyof typeof MESSAGES>) {
      for (const [key, text] of Object.entries(MESSAGES[locale])) {
        assert.notEqual(text.trim(), "", `${locale}:${key}`);
      }
    }
  });

  it("translate returns the text for the requested locale", () => {
    assert.equal(translate("en", "auth.signIn"), "Sign in");
    assert.equal(translate("ar", "auth.signIn"), MESSAGES.ar["auth.signIn"]);
  });
});
