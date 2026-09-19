import deleteIcon from "@expo/material-symbols/delete.xml";
import { Host, Icon } from "@expo/ui/jetpack-compose";
import { Link } from "expo-router";
import { Settings } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { useAppColors, useResolvedColorScheme } from "@/lib/config/colors";

export function HomeHeaderActions() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();

  return (
    <View style={styles.actions}>
      <Link href="/trash" asChild>
        <Pressable
          accessibilityLabel="Open trash"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.headerButton,
            pressed ? { backgroundColor: colors.surface } : null,
          ]}
        >
          <View pointerEvents="none">
            <Host colorScheme={colorScheme} matchContents>
              <Icon
                contentDescription="Open trash"
                size={24}
                source={deleteIcon}
                tint={colors.textMuted}
              />
            </Host>
          </View>
        </Pressable>
      </Link>
      <Link href="/settings" asChild>
        <Pressable
          accessibilityLabel="Open settings"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.headerButton,
            pressed ? { backgroundColor: colors.surface } : null,
          ]}
        >
          <Settings color={colors.textMuted} size={24} strokeWidth={2.1} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headerButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
