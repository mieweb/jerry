/**
 * Terminal color palettes for jerry-term UI.
 */

export interface ColorPalette {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  borderPrimary: string;
  borderSecondary: string;
}

export const darkColors: ColorPalette = {
  bgPrimary: "#0f0f0f",
  bgSecondary: "#1a1a1a",
  bgTertiary: "#2a2a2a",
  textPrimary: "#ffffff",
  textSecondary: "#a0a0a0",
  textMuted: "#606060",
  accent: "#d97706",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  borderPrimary: "#404040",
  borderSecondary: "#606060",
};

export const lightColors: ColorPalette = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f5f5f5",
  bgTertiary: "#e5e5e5",
  textPrimary: "#1a1a1a",
  textSecondary: "#525252",
  textMuted: "#a3a3a3",
  accent: "#d97706",
  success: "#059669",
  warning: "#d97706",
  error: "#dc2626",
  info: "#2563eb",
  borderPrimary: "#d4d4d4",
  borderSecondary: "#a3a3a3",
};

export type ThemeMode = "dark" | "light";

export function getColors(mode: ThemeMode): ColorPalette {
  return mode === "dark" ? darkColors : lightColors;
}
