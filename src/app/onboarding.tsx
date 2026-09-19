import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { Settings } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Button,
  Host,
  OutlinedButton,
  Shape,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxWidth,
  height as composeHeight,
} from "@expo/ui/jetpack-compose/modifiers";

import {
  type AppColors,
  useAppColors,
  useResolvedColorScheme,
} from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";
import { openAppAllFilesAccessSettings } from "@/lib/hooks";
import { useSettingsStore } from "@/lib/store";

type OnboardingStep = 0 | 1;

const ONBOARDING_ICON_SIZE = 112;
const ONBOARDING_BUTTON_HEIGHT = 52;

export default function Onboarding() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const { height, width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState<OnboardingStep>(0);
  const pagerRef = useRef<ScrollView | null>(null);
  const completeOnboarding = useSettingsStore(
    (state) => state.completeOnboarding,
  );
  const setAutoscanEnabled = useSettingsStore(
    (state) => state.setAutoscanEnabled,
  );
  const logo =
    colorScheme === "dark"
      ? require("../../assets/images/icon-dark.svg")
      : require("../../assets/images/icon-light.svg");

  const goToStep = (nextStep: OnboardingStep) => {
    setStep(nextStep);
    pagerRef.current?.scrollTo({ animated: true, x: nextStep * width });
  };

  const handlePagerMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextStep = Math.round(event.nativeEvent.contentOffset.x / width);
    setStep(nextStep === 1 ? 1 : 0);
  };

  const finishWithoutAutoscan = () => {
    setAutoscanEnabled(false);
    completeOnboarding();
    router.replace("/");
  };

  const openStorageSettings = () => {
    completeOnboarding();
    router.replace("/");

    if (Platform.OS === "android") {
      void openAppAllFilesAccessSettings();
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.pagerContent}
        horizontal
        onMomentumScrollEnd={handlePagerMomentumEnd}
        pagingEnabled
        ref={pagerRef}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={[styles.page, { minHeight: height, width }]}>
          <View style={styles.stage}>
            <View style={styles.visual}>
              <Image source={logo} style={styles.logo} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>Welcome to Runa</Text>
              <Text style={styles.body}>
                Read and organize books from your device in one quiet library.
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View
              style={styles.dots}
              accessibilityLabel={`Step ${step + 1} of 2`}
            >
              <View
                style={[styles.dot, step === 0 ? styles.dotActive : null]}
              />
              <View
                style={[styles.dot, step === 1 ? styles.dotActive : null]}
              />
            </View>
            <OnboardingButton
              colorScheme={colorScheme}
              colors={colors}
              label="Continue"
              onPress={() => {
                goToStep(1);
              }}
            />
            <View style={styles.buttonSlot} />
          </View>
        </View>

        <View style={[styles.page, { minHeight: height, width }]}>
          <View style={styles.stage}>
            <View style={styles.visual}>
              <Settings
                color={colors.accent}
                size={ONBOARDING_ICON_SIZE}
                strokeWidth={1.5}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>Scan your books</Text>
              <Text style={styles.body}>
                Open Android settings and allow all files access to let Runa
                find PDF, EPUB, and FB2 files automatically.
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <View
              style={styles.dots}
              accessibilityLabel={`Step ${step + 1} of 2`}
            >
              <View
                style={[styles.dot, step === 0 ? styles.dotActive : null]}
              />
              <View
                style={[styles.dot, step === 1 ? styles.dotActive : null]}
              />
            </View>
            <OnboardingButton
              colorScheme={colorScheme}
              colors={colors}
              label="Open settings"
              onPress={openStorageSettings}
            />
            <OnboardingButton
              colorScheme={colorScheme}
              colors={colors}
              label="Skip all-files scan"
              onPress={finishWithoutAutoscan}
              variant="outlined"
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function OnboardingButton({
  colorScheme,
  colors,
  label,
  onPress,
  variant = "filled",
}: {
  colorScheme: "dark" | "light";
  colors: AppColors;
  label: string;
  onPress: () => void;
  variant?: "filled" | "outlined";
}) {
  const NativeButton = variant === "outlined" ? OutlinedButton : Button;
  const contentColor =
    variant === "outlined" ? colors.accent : colors.background;

  return (
    <Host
      colorScheme={colorScheme}
      seedColor={colors.accent}
      style={styles.host}
    >
      <NativeButton
        colors={{
          containerColor:
            variant === "outlined" ? "transparent" : colors.accent,
          contentColor,
        }}
        modifiers={[fillMaxWidth(), composeHeight(ONBOARDING_BUTTON_HEIGHT)]}
        onClick={onPress}
        shape={Shape.RoundedCorner({
          cornerRadii: {
            bottomEnd: 8,
            bottomStart: 8,
            topEnd: 8,
            topStart: 8,
          },
        })}
      >
        <ComposeText
          color={contentColor}
          style={{
            fontSize: 15,
            fontWeight: "600",
            lineHeight: 20,
          }}
        >
          {label}
        </ComposeText>
      </NativeButton>
    </Host>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    scroll: {
      backgroundColor: colors.background,
      flex: 1,
    },
    pagerContent: {
      backgroundColor: colors.background,
    },
    page: {
      backgroundColor: colors.background,
      flex: 1,
      gap: 18,
      justifyContent: "space-between",
      paddingBottom: 28,
      paddingHorizontal: 24,
      paddingTop: 40,
    },
    dots: {
      alignSelf: "center",
      flexDirection: "row",
      gap: 6,
    },
    dot: {
      backgroundColor: colors.border,
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    dotActive: {
      backgroundColor: colors.accent,
      width: 24,
    },
    stage: {
      flex: 1,
      gap: 20,
      justifyContent: "center",
      paddingBottom: 12,
      paddingTop: 20,
    },
    visual: {
      alignItems: "center",
      alignSelf: "center",
      height: 176,
      justifyContent: "center",
      width: 176,
    },
    logo: {
      height: ONBOARDING_ICON_SIZE,
      width: ONBOARDING_ICON_SIZE,
    },
    copy: {
      alignItems: "center",
      gap: 12,
      minHeight: 124,
      justifyContent: "flex-start",
    },
    title: {
      color: colors.text,
      fontFamily: fonts.bold,
      fontSize: 30,
      lineHeight: 36,
      textAlign: "center",
    },
    body: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 16,
      lineHeight: 24,
      textAlign: "center",
    },
    actions: {
      gap: 12,
      paddingBottom: 8,
    },
    buttonSlot: {
      height: ONBOARDING_BUTTON_HEIGHT,
    },
  });

const styles = StyleSheet.create({
  host: {
    height: ONBOARDING_BUTTON_HEIGHT,
    width: "100%",
  },
});
