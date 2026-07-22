/**
 * Tests for theme system.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getTheme,
  getColors,
  darkColors,
  lightColors,
  symbols,
} from "./index.ts";

describe("Theme", () => {
  describe("getColors", () => {
    it("returns dark colors for dark mode", () => {
      const colors = getColors("dark");
      assert.strictEqual(colors, darkColors);
    });

    it("returns light colors for light mode", () => {
      const colors = getColors("light");
      assert.strictEqual(colors, lightColors);
    });
  });

  describe("getTheme", () => {
    it("defaults to dark mode", () => {
      const theme = getTheme();
      assert.strictEqual(theme.mode, "dark");
      assert.strictEqual(theme.colors, darkColors);
    });

    it("returns dark theme when specified", () => {
      const theme = getTheme("dark");
      assert.strictEqual(theme.mode, "dark");
      assert.strictEqual(theme.colors, darkColors);
    });

    it("returns light theme when specified", () => {
      const theme = getTheme("light");
      assert.strictEqual(theme.mode, "light");
      assert.strictEqual(theme.colors, lightColors);
    });
  });

  describe("darkColors", () => {
    it("has all required color keys", () => {
      const requiredKeys = [
        "bgPrimary",
        "bgSecondary",
        "bgTertiary",
        "textPrimary",
        "textSecondary",
        "textMuted",
        "accent",
        "success",
        "warning",
        "error",
        "info",
        "borderPrimary",
        "borderSecondary",
      ];

      for (const key of requiredKeys) {
        assert.ok(
          key in darkColors,
          `darkColors missing required key: ${key}`
        );
      }
    });

    it("has valid hex color values", () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

      for (const [key, value] of Object.entries(darkColors)) {
        assert.ok(
          hexColorRegex.test(value),
          `${key} has invalid hex color: ${value}`
        );
      }
    });
  });

  describe("lightColors", () => {
    it("has all required color keys", () => {
      const requiredKeys = [
        "bgPrimary",
        "bgSecondary",
        "bgTertiary",
        "textPrimary",
        "textSecondary",
        "textMuted",
        "accent",
        "success",
        "warning",
        "error",
        "info",
        "borderPrimary",
        "borderSecondary",
      ];

      for (const key of requiredKeys) {
        assert.ok(
          key in lightColors,
          `lightColors missing required key: ${key}`
        );
      }
    });

    it("has valid hex color values", () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

      for (const [key, value] of Object.entries(lightColors)) {
        assert.ok(
          hexColorRegex.test(value),
          `${key} has invalid hex color: ${value}`
        );
      }
    });
  });

  describe("symbols", () => {
    it("has expected terminal symbols", () => {
      assert.strictEqual(symbols.prompt, ">");
      assert.strictEqual(symbols.systemPrompt, "$");
      assert.strictEqual(symbols.dot, "●");
      assert.strictEqual(symbols.checkmark, "✓");
      assert.strictEqual(symbols.cross, "✗");
      assert.strictEqual(symbols.warning, "⚠");
      assert.strictEqual(symbols.bullet, "•");
    });

    it("has box drawing characters", () => {
      assert.strictEqual(symbols.horizontalLine, "─");
      assert.strictEqual(symbols.verticalLine, "│");
      assert.strictEqual(symbols.topLeft, "┌");
      assert.strictEqual(symbols.topRight, "┐");
      assert.strictEqual(symbols.bottomLeft, "└");
      assert.strictEqual(symbols.bottomRight, "┘");
    });
  });
});
