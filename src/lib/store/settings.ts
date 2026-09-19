import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark";
export type ReaderAppearance = "day" | "night";

type SettingsState = {
  anonymousStatsEnabled: boolean;
  autoscanEnabled: boolean;
  hasCompletedOnboarding: boolean;
  hasHydrated: boolean;
  readerAppearance: ReaderAppearance;
  themePreference: ThemePreference;
  completeOnboarding: () => void;
  setAnonymousStatsEnabled: (enabled: boolean) => void;
  setAutoscanEnabled: (enabled: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setReaderAppearance: (appearance: ReaderAppearance) => void;
  setThemePreference: (preference: ThemePreference) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      anonymousStatsEnabled: true,
      autoscanEnabled: true,
      hasCompletedOnboarding: false,
      hasHydrated: false,
      readerAppearance: "day",
      themePreference: "system",
      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true });
      },
      setAnonymousStatsEnabled: (anonymousStatsEnabled) => {
        set({ anonymousStatsEnabled });
      },
      setAutoscanEnabled: (autoscanEnabled) => {
        set({ autoscanEnabled });
      },
      setHasHydrated: (hasHydrated) => {
        set({ hasHydrated });
      },
      setReaderAppearance: (readerAppearance) => {
        set({ readerAppearance });
      },
      setThemePreference: (themePreference) => {
        set({ themePreference });
      },
    }),
    {
      name: "runa-settings",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        anonymousStatsEnabled: state.anonymousStatsEnabled,
        autoscanEnabled: state.autoscanEnabled,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        readerAppearance: state.readerAppearance,
        themePreference: state.themePreference,
      }),
    },
  ),
);
