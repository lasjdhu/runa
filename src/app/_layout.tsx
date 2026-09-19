import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import { Observe, ObserveRoot, useObserve } from "expo-observe";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";
import { initializeLibraryDatabase } from "@/lib/data/db";
import { hydrateLibraryForStartup } from "@/lib/hooks";
import { useSettingsStore } from "@/lib/store";

void SplashScreen.preventAutoHideAsync();

Observe.configure({
  dispatchingEnabled: false,
  integrations: {
    "expo-router": true,
  },
});

function RootLayout() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const anonymousStatsEnabled = useSettingsStore(
    (state) => state.anonymousStatsEnabled,
  );
  const hasCompletedOnboarding = useSettingsStore(
    (state) => state.hasCompletedOnboarding,
  );
  const settingsHydrated = useSettingsStore((state) => state.hasHydrated);
  const { markInteractive } = useObserve();
  const [startupReady, setStartupReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const ready =
    (fontsLoaded || Boolean(fontError)) && startupReady && settingsHydrated;

  useEffect(() => {
    let canceled = false;

    const initializeStartupData = async () => {
      try {
        await initializeLibraryDatabase();
        await hydrateLibraryForStartup();
      } finally {
        if (!canceled) {
          setStartupReady(true);
        }
      }
    };

    void initializeStartupData();

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    void SplashScreen.hideAsync();
    markInteractive();
  }, [markInteractive, ready]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    Observe.configure({
      dispatchingEnabled: anonymousStatsEnabled,
      integrations: {
        "expo-router": true,
      },
    });
  }, [anonymousStatsEnabled, settingsHydrated]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!hasCompletedOnboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={hasCompletedOnboarding}>
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="trash" />
          <Stack.Screen name="book/[extension]" />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}

export default ObserveRoot.wrap(RootLayout);
