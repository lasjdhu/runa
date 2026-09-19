import { useCallback, useMemo, useState } from "react";
import { Bookmark, ListTree, Pencil, Trash2 } from "lucide-react-native";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppColors } from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";
import type {
  ReaderBookmarkMarker,
  ReaderChapterMarker,
} from "@/components/organisms/ReaderPageFrame";
import { TextInputDialog } from "@/components/molecules/TextInputDialog";

type ReaderContentsModalProps = {
  bookmarks: ReaderBookmarkMarker[];
  chapters: ReaderChapterMarker[];
  colors: AppColors;
  isVisible: boolean;
  onClose: () => void;
  onDeleteBookmark?: (pageNumber: number) => void;
  onPageSelect: (pageNumber: number) => void;
  onRenameBookmark?: (pageNumber: number, title: string) => void;
};

export function ReaderContentsModal({
  bookmarks,
  chapters,
  colors,
  isVisible,
  onClose,
  onDeleteBookmark,
  onPageSelect,
  onRenameBookmark,
}: ReaderContentsModalProps) {
  const [contentsFilter, setContentsFilter] = useState<
    "all" | "chapters" | "bookmarks"
  >("all");
  const [renamingBookmark, setRenamingBookmark] = useState<{
    pageNumber: number;
    title: string;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const contentsList = useMemo(() => {
    const list: {
      id: string;
      kind: "chapter" | "bookmark";
      pageNumber: number;
      title: string;
    }[] = [];

    if (contentsFilter === "all" || contentsFilter === "chapters") {
      chapters.forEach((c) =>
        list.push({
          id: `c-${c.pageNumber}-${c.title}`,
          kind: "chapter",
          pageNumber: c.pageNumber,
          title: c.title || `Page ${c.pageNumber}`,
        }),
      );
    }

    if (contentsFilter === "all" || contentsFilter === "bookmarks") {
      bookmarks.forEach((b) =>
        list.push({
          id: `b-${b.pageNumber}-${b.title}`,
          kind: "bookmark",
          pageNumber: b.pageNumber,
          title: b.title || `Bookmark on page ${b.pageNumber}`,
        }),
      );
    }

    return list.sort((a, b) => a.pageNumber - b.pageNumber);
  }, [chapters, bookmarks, contentsFilter]);

  const keyExtractor = useCallback(
    (item: (typeof contentsList)[0]) => item.id,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof contentsList)[0] }) => (
      <View style={styles.contentsItem}>
        <Pressable
          onPress={() => {
            onClose();
            onPageSelect(item.pageNumber);
          }}
          style={styles.contentsItemMain}
        >
          <View style={styles.contentsItemIcon}>
            {item.kind === "chapter" ? (
              <ListTree color={colors.textSubtle} size={18} strokeWidth={2} />
            ) : (
              <Bookmark color={colors.textSubtle} size={18} strokeWidth={2} />
            )}
          </View>
          <Text numberOfLines={1} style={styles.contentsItemTitle}>
            {item.title}
          </Text>
        </Pressable>
        {item.kind === "bookmark" && (onRenameBookmark || onDeleteBookmark) ? (
          <View style={styles.contentsItemActions}>
            {onRenameBookmark ? (
              <Pressable
                accessibilityLabel={`Rename bookmark on page ${item.pageNumber}`}
                hitSlop={8}
                onPress={() => {
                  setRenamingBookmark({
                    pageNumber: item.pageNumber,
                    title: item.title,
                  });
                }}
                style={styles.contentsItemAction}
              >
                <Pencil color={colors.textSubtle} size={18} strokeWidth={2} />
              </Pressable>
            ) : null}
            {onDeleteBookmark ? (
              <Pressable
                accessibilityLabel={`Delete bookmark on page ${item.pageNumber}`}
                hitSlop={8}
                onPress={() => {
                  Alert.alert(
                    "Delete bookmark?",
                    `Remove the bookmark on page ${item.pageNumber}?`,
                    [
                      { style: "cancel", text: "Cancel" },
                      {
                        onPress: () => onDeleteBookmark(item.pageNumber),
                        style: "destructive",
                        text: "Delete",
                      },
                    ],
                  );
                }}
                style={styles.contentsItemAction}
              >
                <Trash2 color={colors.textSubtle} size={18} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text style={styles.contentsItemPage}>{item.pageNumber}</Text>
      </View>
    ),
    [
      colors.textSubtle,
      onClose,
      onDeleteBookmark,
      onPageSelect,
      onRenameBookmark,
      styles,
    ],
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={isVisible}
    >
      <View
        style={[
          styles.contentsContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <View
          style={[
            styles.contentsHeader,
            { paddingTop: Math.max(insets.top, 16) },
          ]}
        >
          <Text style={styles.contentsTitle}>Contents</Text>
          <Pressable onPress={onClose} style={styles.contentsClose}>
            <Text style={[styles.contentsCloseText, { color: colors.accent }]}>
              Close
            </Text>
          </Pressable>
        </View>

        <View style={styles.contentsFilters}>
          {(["all", "chapters", "bookmarks"] as const).map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setContentsFilter(filter)}
              style={[
                styles.filterButton,
                contentsFilter === filter && {
                  backgroundColor: colors.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  {
                    color:
                      contentsFilter === filter ? colors.surface : colors.text,
                  },
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          data={contentsList}
          initialNumToRender={15}
          keyExtractor={keyExtractor}
          maxToRenderPerBatch={10}
          renderItem={renderItem}
          windowSize={5}
        />
        {renamingBookmark ? (
          <TextInputDialog
            autoSelect
            defaultValue={renamingBookmark.title}
            key={`${renamingBookmark.pageNumber}-${renamingBookmark.title}`}
            onConfirm={(nextTitle) => {
              onRenameBookmark?.(renamingBookmark.pageNumber, nextTitle);
              setRenamingBookmark(null);
            }}
            onDismiss={() => setRenamingBookmark(null)}
            title="Rename bookmark"
          />
        ) : null}
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    contentsContainer: {
      flex: 1,
    },
    contentsHeader: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 16,
      paddingHorizontal: 18,
    },
    contentsTitle: {
      color: colors.text,
      fontFamily: fonts.semiBold,
      fontSize: 18,
    },
    contentsClose: {
      padding: 4,
    },
    contentsCloseText: {
      fontFamily: fonts.medium,
      fontSize: 16,
    },
    contentsFilters: {
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      padding: 16,
    },
    filterButton: {
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    filterButtonText: {
      fontFamily: fonts.medium,
      fontSize: 14,
    },
    contentsItem: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingHorizontal: 18,
    },
    contentsItemMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 12,
      paddingVertical: 14,
    },
    contentsItemIcon: {
      alignItems: "center",
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    contentsItemTitle: {
      color: colors.text,
      flex: 1,
      fontFamily: fonts.medium,
      fontSize: 16,
    },
    contentsItemPage: {
      color: colors.textSubtle,
      fontFamily: fonts.semiBold,
      fontSize: 14,
      fontVariant: ["tabular-nums"],
      textAlign: "right",
      width: 44,
    },
    contentsItemActions: {
      flexDirection: "row",
      gap: 4,
    },
    contentsItemAction: {
      alignItems: "center",
      height: 32,
      justifyContent: "center",
      width: 32,
    },
  });
