import { useColorScheme } from "react-native";

import { useSettingsStore } from "@/lib/store";

const sharedColors = {
  accent: "#C65A68",
  accentMuted: "#5A2B31",
  success: "#8DAA91",
  warning: "#C9A15A",
  danger: "#C65A68",
} as const;

export const colorSchemes = {
  dark: {
    ...sharedColors,
    background: "#121212",
    surface: "#1A1A1A",
    surfaceRaised: "#222222",
    border: "#34302F",
    text: "#F5F3F0",
    textMuted: "#B9B2AE",
    textSubtle: "#7D7672",
  },
  light: {
    ...sharedColors,
    background: "#F7F4F1",
    surface: "#EFE9E3",
    surfaceRaised: "#FFFFFF",
    border: "#DED6D1",
    text: "#211C1A",
    textMuted: "#6E625D",
    textSubtle: "#928782",
  },
} as const;

export type AppThemeName = keyof typeof colorSchemes;
export type AppColors = (typeof colorSchemes)[AppThemeName];
export type AppColor = keyof AppColors;

export const colors = colorSchemes.dark;

export function resolveColorScheme(
  preference: "system" | AppThemeName,
  systemScheme: ReturnType<typeof useColorScheme>,
): AppThemeName {
  if (preference !== "system") {
    return preference;
  }

  return systemScheme === "light" ? "light" : "dark";
}

export function useResolvedColorScheme(): AppThemeName {
  const systemScheme = useColorScheme();
  const themePreference = useSettingsStore((state) => state.themePreference);

  return resolveColorScheme(themePreference, systemScheme);
}

export function useAppColors(): AppColors {
  return colorSchemes[useResolvedColorScheme()];
}
