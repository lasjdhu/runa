import addIcon from "@expo/material-symbols/add.xml";
import {
  FloatingActionButton as ComposeFloatingActionButton,
  Host,
  Icon,
} from "@expo/ui/jetpack-compose";
import { StyleSheet, View } from "react-native";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";

type FloatingActionButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
};

export function FloatingActionButton({
  accessibilityLabel,
  onPress,
}: FloatingActionButtonProps) {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Host colorScheme={colorScheme} matchContents seedColor={colors.accent}>
        <NativeFloatingActionButton
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
        />
      </Host>
    </View>
  );
}

function NativeFloatingActionButton({
  accessibilityLabel,
  onPress,
}: FloatingActionButtonProps) {
  const colors = useAppColors();

  return (
    <ComposeFloatingActionButton
      containerColor={colors.accent}
      onClick={onPress}
    >
      <ComposeFloatingActionButton.Icon>
        <Icon
          contentDescription={accessibilityLabel}
          size={28}
          source={addIcon}
          tint={colors.background}
        />
      </ComposeFloatingActionButton.Icon>
    </ComposeFloatingActionButton>
  );
}

const styles = StyleSheet.create({
  container: {
    bottom: 24,
    position: "absolute",
    right: 20,
  },
});
