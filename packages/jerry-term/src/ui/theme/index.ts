/**
 * Theme system for jerry-term UI.
 */

export {
  type ColorPalette,
  type ThemeMode,
  darkColors,
  lightColors,
  getColors,
} from "./colors.ts";

export { fontStack, symbols, type SymbolKey } from "./typography.ts";

export interface Theme {
  mode: ThemeMode;
  colors: ColorPalette;
}

import { getColors, type ThemeMode, type ColorPalette } from "./colors.ts";

export function getTheme(mode: ThemeMode = "dark"): Theme {
  return {
    mode,
    colors: getColors(mode),
  };
}
