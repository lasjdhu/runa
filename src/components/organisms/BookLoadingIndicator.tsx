import { CircularProgressIndicator, Host } from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import { StyleSheet, View } from "react-native";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";

export function BookLoadingIndicator() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Host colorScheme={colorScheme} matchContents seedColor={colors.accent}>
        <CircularProgressIndicator
          color={colors.accent}
          modifiers={[size(44, 44)]}
          trackColor={colors.surfaceRaised}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
