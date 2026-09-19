import { BookOpen } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { useAppColors } from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";

type LibraryEmptyStateProps = {
  message: string;
  title: string;
};

export function LibraryEmptyState({ message, title }: LibraryEmptyStateProps) {
  const colors = useAppColors();

  return (
    <View style={styles.emptyState}>
      <BookOpen
        color={colors.textSubtle}
        size={88}
        strokeWidth={1.7}
        style={styles.emptyIcon}
      />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 72,
  },
  emptyIcon: {
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 22,
    lineHeight: 28,
    textAlign: "center",
  },
  emptyMessage: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    maxWidth: 280,
    textAlign: "center",
  },
});
