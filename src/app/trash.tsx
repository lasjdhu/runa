import * as FileSystem from "expo-file-system/legacy";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet } from "react-native";
import {
  AlertDialog,
  Host,
  Text as ComposeText,
  TextButton,
} from "@expo/ui/jetpack-compose";

import { BookRow, LibraryEmptyState } from "@/components/molecules";
import { BookLoadingIndicator } from "@/components/organisms/BookLoadingIndicator";
import {
  type AppColors,
  useAppColors,
  useResolvedColorScheme,
} from "@/lib/config/colors";
import {
  deleteBook,
  listLibraryBooks,
  restoreBook,
  type LibraryBookRecord,
} from "@/lib/data/api";
import type { Book } from "@/lib/types";

function bookRecordToBook(record: LibraryBookRecord): Book {
  return {
    id: record.id,
    uri: record.primaryUri ?? undefined,
    extension: record.extension,
    archive: record.archive ?? undefined,
    title: record.title,
    author: record.author ?? undefined,
    publisher: record.publisher ?? undefined,
    publishedDate: record.publishedDate ?? undefined,
    description: record.description ?? undefined,
    language: record.language ?? undefined,
    isbn: record.isbn ?? undefined,
    series: record.series ?? undefined,
    seriesIndex: record.seriesIndex ?? undefined,
    coverBase64: record.coverUri ?? undefined,
    progress: `${Math.round(record.progress)}%`,
    isStarred: record.isStarred,
  };
}

export default function Trash() {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [books, setBooks] = useState<Book[]>([]);
  const [isFetchingTrash, setIsFetchingTrash] = useState(true);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<Book | null>(null);
  const refreshRequestIdRef = useRef(0);

  const refreshTrash = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;

    setIsFetchingTrash(true);

    try {
      const records = await listLibraryBooks("trashed");

      if (requestId === refreshRequestIdRef.current) {
        setBooks(records.map(bookRecordToBook));
      }
    } finally {
      if (requestId === refreshRequestIdRef.current) {
        setIsFetchingTrash(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshTrash();

      return () => {
        refreshRequestIdRef.current += 1;
      };
    }, [refreshTrash]),
  );

  const handleRestore = useCallback(
    async (book: Book) => {
      if (!book.id) {
        return;
      }

      await restoreBook(book.id);
      await refreshTrash();
    },
    [refreshTrash],
  );

  const handleConfirmDelete = useCallback(async () => {
    const book = pendingDeleteBook;

    if (!book?.id) {
      setPendingDeleteBook(null);
      return;
    }

    try {
      if (book.uri) {
        await FileSystem.deleteAsync(book.uri, { idempotent: true });
      }

      await deleteBook(book.id);
      setPendingDeleteBook(null);
      await refreshTrash();
    } catch {
      setPendingDeleteBook(null);
    }
  }, [pendingDeleteBook, refreshTrash]);

  const showLoadingState = isFetchingTrash && books.length === 0;
  const showEmptyState = !isFetchingTrash && books.length === 0;
  const listEmptyComponent = useMemo(() => {
    if (showLoadingState) {
      return <BookLoadingIndicator />;
    }

    if (!showEmptyState) {
      return null;
    }

    return (
      <LibraryEmptyState
        message="Books moved to trash will appear here"
        title="Trash is empty"
      />
    );
  }, [showEmptyState, showLoadingState]);
  const keyExtractor = useCallback(
    (book: Book) => book.id ?? book.uri ?? book.title,
    [],
  );
  const renderBook = useCallback(
    ({ item: book }: { item: Book }) => (
      <BookRow
        actionMode="trash"
        {...book}
        onDeletePermanently={() => {
          setPendingDeleteBook(book);
        }}
        onRestore={() => {
          void handleRestore(book);
        }}
      />
    ),
    [handleRestore],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            color: colors.text,
            fontWeight: "600",
          },
          title: "Trash",
        }}
      />

      <FlatList
        contentContainerStyle={[
          styles.listContent,
          books.length === 0 ? styles.emptyListContent : null,
        ]}
        data={books}
        keyExtractor={keyExtractor}
        ListEmptyComponent={listEmptyComponent}
        renderItem={renderBook}
        style={styles.scroll}
      />

      {pendingDeleteBook ? (
        <Host
          colorScheme={colorScheme}
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
          useViewportSizeMeasurement
        >
          <AlertDialog
            colors={{
              containerColor: colors.surfaceRaised,
              textContentColor: colors.textMuted,
              titleContentColor: colors.text,
            }}
            onDismissRequest={() => {
              setPendingDeleteBook(null);
            }}
            tonalElevation={0}
          >
            <AlertDialog.Title>
              <ComposeText
                color={colors.text}
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  lineHeight: 26,
                }}
              >
                Delete permanently?
              </ComposeText>
            </AlertDialog.Title>
            <AlertDialog.Text>
              <ComposeText
                color={colors.textMuted}
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                This will delete the book file from your device and remove it
                from Runa.
              </ComposeText>
            </AlertDialog.Text>
            <AlertDialog.ConfirmButton>
              <TextButton
                colors={{
                  contentColor: colors.accent,
                }}
                onClick={() => {
                  void handleConfirmDelete();
                }}
              >
                <ComposeText color={colors.accent}>
                  Delete from device
                </ComposeText>
              </TextButton>
            </AlertDialog.ConfirmButton>
            <AlertDialog.DismissButton>
              <TextButton
                colors={{
                  contentColor: colors.textMuted,
                }}
                onClick={() => {
                  setPendingDeleteBook(null);
                }}
              >
                <ComposeText color={colors.textMuted}>Cancel</ComposeText>
              </TextButton>
            </AlertDialog.DismissButton>
          </AlertDialog>
        </Host>
      ) : null}
    </>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    scroll: {
      backgroundColor: colors.background,
      flex: 1,
    },
    listContent: {
      backgroundColor: colors.background,
      gap: 12,
      paddingBottom: 36,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    emptyListContent: {
      flexGrow: 1,
    },
  });
