import deleteIcon from "@expo/material-symbols/delete.xml";
import settingsIcon from "@expo/material-symbols/settings.xml";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
} from "react-native";
import type { SearchBarCommands } from "react-native-screens";

import { FloatingActionButton } from "@/components/atoms";
import {
  BookRow,
  HeaderTitle,
  LibraryEmptyState,
  ScanPermissionDialog,
  type ScanPermissionDialogMode,
} from "@/components/molecules";
import { type AppColors, useAppColors } from "@/lib/config/colors";
import {
  checkAllFilesPermission,
  openAppAllFilesAccessSettings,
  useScanFileSystem,
} from "@/lib/hooks";
import { useSettingsStore } from "@/lib/store";

export default function Index() {
  const settingsHydrated = useSettingsStore((state) => state.hasHydrated);
  const hasCompletedOnboarding = useSettingsStore(
    (state) => state.hasCompletedOnboarding,
  );

  return settingsHydrated && hasCompletedOnboarding ? <LibraryScreen /> : null;
}

function LibraryScreen() {
  const colors = useAppColors();
  const themedStyles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [scanPermissionDialogMode, setScanPermissionDialogMode] =
    useState<ScanPermissionDialogMode | null>(null);
  const pendingManualScanAfterSettingsRef = useRef(false);
  const settingsHydrated = useSettingsStore((state) => state.hasHydrated);
  const hasCompletedOnboarding = useSettingsStore(
    (state) => state.hasCompletedOnboarding,
  );
  const autoscanEnabled = useSettingsStore((state) => state.autoscanEnabled);
  const setAutoscanEnabled = useSettingsStore(
    (state) => state.setAutoscanEnabled,
  );
  const [
    books,
    scanForBooks,
    importBook,
    isScanning,
    scanStatus,
    ,
    lastPermissionDeniedScanId,
    lastPermissionDeniedScanTrigger,
    activeScanTrigger,
    toggleBookStarred,
    moveBookToTrash,
    refreshLibrary,
    searchLibrary,
  ] = useScanFileSystem();
  const searchBarRef = useRef<SearchBarCommands | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshLibrary();
    }, [refreshLibrary]),
  );

  useEffect(() => {
    if (
      !settingsHydrated ||
      Platform.OS !== "android" ||
      scanStatus !== "permission-denied" ||
      lastPermissionDeniedScanId === 0
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (
        hasCompletedOnboarding &&
        lastPermissionDeniedScanTrigger !== "manual"
      ) {
        return;
      }

      setScanPermissionDialogMode(
        lastPermissionDeniedScanTrigger === "manual" ? "manual" : "auto",
      );
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    lastPermissionDeniedScanId,
    lastPermissionDeniedScanTrigger,
    scanStatus,
    hasCompletedOnboarding,
    settingsHydrated,
  ]);

  const scanBooks = useCallback(() => {
    void scanForBooks({ force: true, trigger: "manual" });
  }, [scanForBooks]);
  const isLoadingLibrary = scanStatus === "loading";
  const isBackgroundAutoscan =
    isScanning && activeScanTrigger === "auto" && books.length > 0;
  const isRefreshControlActive =
    (isScanning && !isBackgroundAutoscan) ||
    (settingsHydrated && autoscanEnabled && isLoadingLibrary);
  const showEmptyState = books.length === 0 && !isLoadingLibrary && !isScanning;
  const emptyTitle = query.trim().length > 0 ? "No matching books" : "No books";
  const emptyMessage =
    scanStatus === "invalid-file"
      ? "Choose a PDF, EPUB, or FB2 file"
      : "Scan your device for books or import a file";
  const keyExtractor = useCallback(
    (book: (typeof books)[number]) => book.id ?? book.uri ?? book.title,
    [],
  );
  const listEmptyComponent = useMemo(
    () =>
      showEmptyState ? (
        <LibraryEmptyState message={emptyMessage} title={emptyTitle} />
      ) : null,
    [emptyMessage, emptyTitle, showEmptyState],
  );
  const openBook = useCallback((book: (typeof books)[number]) => {
    if (book.extension !== "pdf" || !book.uri) {
      return;
    }

    router.push({
      pathname: "/book/[extension]",
      params: {
        id: book.id,
        extension: book.extension,
        uri: book.uri,
      },
    });
  }, []);
  const renderBook = useCallback(
    ({ item: book }: { item: (typeof books)[number] }) => (
      <BookRow
        {...book}
        onPress={
          book.extension === "pdf" && book.uri
            ? () => {
                openBook(book);
              }
            : undefined
        }
        onStar={() => {
          void toggleBookStarred(book);
        }}
        onTrash={() => {
          void moveBookToTrash(book);
        }}
      />
    ),
    [moveBookToTrash, openBook, toggleBookStarred],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    void searchLibrary("");
  }, [searchLibrary]);

  useEffect(() => {
    const timeout = setTimeout(
      () => {
        void searchLibrary(query);
      },
      query.trim() ? 120 : 0,
    );

    return () => {
      clearTimeout(timeout);
    };
  }, [query, searchLibrary]);
  const handleAllowScanAccess = useCallback(() => {
    if (scanPermissionDialogMode === "manual") {
      pendingManualScanAfterSettingsRef.current = true;
    }

    setScanPermissionDialogMode(null);
    void openAppAllFilesAccessSettings();
  }, [scanPermissionDialogMode]);
  const handleDisableAutoscan = useCallback(() => {
    setScanPermissionDialogMode(null);
    setAutoscanEnabled(false);
  }, [setAutoscanEnabled]);
  const handleDismissScanAccess = useCallback(() => {
    setScanPermissionDialogMode(null);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !pendingManualScanAfterSettingsRef.current) {
        return;
      }

      pendingManualScanAfterSettingsRef.current = false;

      void checkAllFilesPermission().then((granted) => {
        if (granted) {
          void scanForBooks({ force: true, trigger: "manual" });
        }
      });
    });

    return () => sub.remove();
  }, [scanForBooks]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitle: () => <HeaderTitle />,
        }}
      />
      <Stack.Toolbar placement="right" tintColor={colors.textMuted}>
        <Stack.Toolbar.Button
          accessibilityLabel="Open trash"
          icon={Platform.OS === "ios" ? "trash" : deleteIcon}
          iconRenderingMode="template"
          onPress={() => {
            router.push("/trash");
          }}
        />
        <Stack.Toolbar.Button
          accessibilityLabel="Open settings"
          icon={Platform.OS === "ios" ? "gearshape" : settingsIcon}
          iconRenderingMode="template"
          onPress={() => {
            router.push("/settings");
          }}
        />
      </Stack.Toolbar>
      <Stack.SearchBar
        barTintColor={colors.background}
        headerIconColor={colors.textMuted}
        hintTextColor={colors.textMuted}
        onCancelButtonPress={clearSearch}
        onChangeText={(event) => {
          const text = event.nativeEvent.text;

          setQuery(text);

          if (query.trim().length > 0 && text.trim().length === 0) {
            void searchLibrary("");
            requestAnimationFrame(() => {
              searchBarRef.current?.cancelSearch();
            });
          }
        }}
        onClose={clearSearch}
        placeholder="Search books"
        ref={searchBarRef}
        textColor={colors.text}
        tintColor={colors.accent}
      />

      <FlatList
        contentContainerStyle={[
          themedStyles.listContent,
          showEmptyState ? themedStyles.emptyListContent : null,
        ]}
        data={books}
        keyExtractor={keyExtractor}
        ListEmptyComponent={listEmptyComponent}
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={scanBooks}
            progressBackgroundColor={colors.surfaceRaised}
            refreshing={isRefreshControlActive}
            tintColor={colors.accent}
          />
        }
        renderItem={renderBook}
        style={themedStyles.scroll}
      />
      <FloatingActionButton
        accessibilityLabel="Import book"
        onPress={() => {
          void importBook();
        }}
      />
      {scanPermissionDialogMode ? (
        <ScanPermissionDialog
          mode={scanPermissionDialogMode}
          onAllow={handleAllowScanAccess}
          onDisable={handleDisableAutoscan}
          onDismiss={handleDismissScanAccess}
        />
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
