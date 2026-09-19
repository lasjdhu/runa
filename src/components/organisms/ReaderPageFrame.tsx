import arrowBackIcon from "@expo/material-symbols/arrow_back.xml";
import bookmarkAddIcon from "@expo/material-symbols/bookmark_add.xml";
import bookmarkRemoveIcon from "@expo/material-symbols/bookmark_remove.xml";
import darkModeIcon from "@expo/material-symbols/dark_mode.xml";
import formatListBulletedIcon from "@expo/material-symbols/format_list_bulleted.xml";
import lightModeIcon from "@expo/material-symbols/light_mode.xml";
import lockIcon from "@expo/material-symbols/lock.xml";
import lockOpenIcon from "@expo/material-symbols/lock_open.xml";
import {
  Host,
  Icon,
  IconButton,
  LinearProgressIndicator,
} from "@expo/ui/jetpack-compose";
import {
  background,
  fillMaxWidth,
  height,
  size,
} from "@expo/ui/jetpack-compose/modifiers";
import { router } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { ReaderContentsModal } from "@/components/molecules/ReaderContentsModal";
import { pageToRatio, type ReaderZoomState } from "@/lib/reader/utils";

import {
  type AppColors,
  useAppColors,
  useResolvedColorScheme,
} from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";
import type { ReaderAppearance } from "@/lib/store";
import { useReaderGestures } from "@/lib/hooks";

export type ReaderChapterMarker = {
  pageNumber: number;
  title: string;
};

export type ReaderBookmarkMarker = {
  pageNumber: number;
  title?: string | null;
};

type ReaderPageFrameProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  author?: string | null;
  bookmarks?: ReaderBookmarkMarker[];
  chapters?: ReaderChapterMarker[];
  children: ReactNode;
  isBookmarked?: boolean;
  isZoomLocked?: boolean;
  lockedZoomState?: ReaderZoomState | null;
  pageBackgroundColor?: string;
  pageKey: string;
  pageNumber: number;
  pageCount: number | null;
  readerAppearance?: ReaderAppearance;
  title?: string | null;
  onGoBack: () => void;
  onGoForward: () => void;
  onDeleteBookmark?: (pageNumber: number) => void;
  onReaderAppearanceChange?: (appearance: ReaderAppearance) => void;
  onPageSelect?: (pageNumber: number) => void;
  onRenameBookmark?: (pageNumber: number, title: string) => void;
  onToggleBookmark?: () => void;
  onZoomLockChange?: (
    locked: boolean,
    zoomState: ReaderZoomState | null,
  ) => void;
  onZoomStateChange?: (zoomState: ReaderZoomState) => void;
};

const SLIDER_THUMB_SIZE = 12;
type ComposeIconSource = ComponentProps<typeof Icon>["source"];

const stylesStatic = StyleSheet.create({
  iconButtonHost: {
    height: 44,
    width: 44,
  },
});

function ReaderComposeIconButton({
  accessibilityLabel,
  colorScheme,
  colors,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  colorScheme: "light" | "dark";
  colors: AppColors;
  icon: ComposeIconSource;
  onPress: () => void;
}) {
  return (
    <Host
      colorScheme={colorScheme}
      seedColor={colors.accent}
      style={stylesStatic.iconButtonHost}
    >
      <IconButton
        colors={{
          containerColor: colors.surface,
          contentColor: colors.text,
        }}
        modifiers={[size(44, 44), background(colors.surface)]}
        onClick={onPress}
      >
        <Icon
          contentDescription={accessibilityLabel}
          size={24}
          source={icon}
          tint={colors.text}
        />
      </IconButton>
    </Host>
  );
}

export function ReaderPageFrame({
  canGoBack,
  canGoForward,
  author,
  bookmarks = [],
  chapters = [],
  children,
  isBookmarked = false,
  isZoomLocked = false,
  lockedZoomState = null,
  pageBackgroundColor,
  pageKey,
  pageNumber,
  pageCount,
  readerAppearance = "day",
  title,
  onGoBack,
  onGoForward,
  onDeleteBookmark,
  onReaderAppearanceChange,
  onPageSelect,
  onRenameBookmark,
  onToggleBookmark,
  onZoomLockChange,
  onZoomStateChange,
}: ReaderPageFrameProps) {
  const colors = useAppColors();
  const resolvedPageBackgroundColor = pageBackgroundColor ?? colors.background;
  const colorScheme = useResolvedColorScheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [draftPageNumber, setDraftPageNumber] = useState(pageNumber);
  const [prevPageNumber, setPrevPageNumber] = useState(pageNumber);
  const [sliderWidth, setSliderWidth] = useState(0);

  const draftPageNumberRef = useRef(pageNumber);

  if (pageNumber !== prevPageNumber) {
    setPrevPageNumber(pageNumber);
    setDraftPageNumber(pageNumber);
    draftPageNumberRef.current = pageNumber;
  }

  const {
    currentPageStyle,
    outgoingPage,
    outgoingPageStyle,
    pageGesture,
    setZoomLocked,
    visiblePage,
  } = useReaderGestures({
    canGoBack,
    canGoForward,
    children,
    isZoomLocked,
    lockedZoomState,
    onGoBack,
    onGoForward,
    onZoomLockChange,
    onZoomStateChange,
    pageKey,
    pageNumber,
    setOverlayVisible,
  });

  const [isContentsVisible, setIsContentsVisible] = useState(false);
  const [pageInputValue, setPageInputValue] = useState<string | null>(null);

  const sliderMax = Math.max(pageCount ?? pageNumber, 1);
  const titleText = title?.trim() || "Untitled book";
  const authorText = author?.trim() || "Unknown author";
  const visibleChapters = pageCount
    ? chapters
        .filter(
          (chapter) =>
            chapter.pageNumber >= 1 && chapter.pageNumber <= pageCount,
        )
        .sort((left, right) => left.pageNumber - right.pageNumber)
    : [];
  const visibleBookmarks = pageCount
    ? bookmarks
        .filter(
          (bookmark) =>
            bookmark.pageNumber >= 1 && bookmark.pageNumber <= pageCount,
        )
        .sort((left, right) => left.pageNumber - right.pageNumber)
    : [];
  const activeChapter =
    visibleChapters.findLast(
      (chapter) => chapter.pageNumber <= draftPageNumber,
    ) ?? null;
  const chapterLabel = activeChapter?.title ?? `Page ${draftPageNumber}`;
  const headerTop = Math.max(insets.top, 0);
  const compactBarBottom = Math.max(insets.bottom, 8);
  const committedProgress = pageToRatio(pageNumber, sliderMax);
  const draftProgress = pageToRatio(draftPageNumber, sliderMax);

  const closeOverlay = useCallback(() => {
    setOverlayVisible(false);
  }, []);

  const handleBookmarkPress = useCallback(() => {
    onToggleBookmark?.();
  }, [onToggleBookmark]);

  const handleAppearancePress = useCallback(() => {
    onReaderAppearanceChange?.(readerAppearance === "night" ? "day" : "night");
  }, [onReaderAppearanceChange, readerAppearance]);

  const updateSliderFromX = useCallback(
    (x: number) => {
      if (!onPageSelect || sliderWidth <= 0) {
        return;
      }

      const ratio = Math.min(Math.max(x / sliderWidth, 0), 1);
      const nextPageNumber = Math.max(
        1,
        Math.min(sliderMax, Math.round(1 + ratio * (sliderMax - 1))),
      );

      draftPageNumberRef.current = nextPageNumber;
      setDraftPageNumber(nextPageNumber);
    },
    [onPageSelect, sliderMax, sliderWidth],
  );

  const commitSliderPage = useCallback(() => {
    onPageSelect?.(draftPageNumberRef.current);
  }, [onPageSelect]);

  const sliderGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      runOnJS(updateSliderFromX)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(updateSliderFromX)(event.x);
    })
    .onFinalize(() => {
      runOnJS(commitSliderPage)();
    });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <GestureDetector gesture={pageGesture}>
        <View style={styles.pageGestureLayer}>
          {outgoingPage ? (
            <Animated.View
              key={`outgoing-${outgoingPage.key}`}
              pointerEvents="none"
              style={[
                styles.pageLayer,
                { backgroundColor: resolvedPageBackgroundColor },
                outgoingPageStyle,
              ]}
            >
              {outgoingPage.node}
            </Animated.View>
          ) : null}
          <Animated.View
            key={visiblePage.key}
            style={[
              styles.pageLayer,
              { backgroundColor: resolvedPageBackgroundColor },
              currentPageStyle,
            ]}
          >
            {visiblePage.node}
          </Animated.View>
        </View>
      </GestureDetector>

      {!overlayVisible ? (
        <View
          pointerEvents="none"
          style={[styles.compactProgressWrap, { bottom: compactBarBottom }]}
        >
          <Host
            colorScheme={colorScheme}
            seedColor={colors.accent}
            style={styles.compactProgressHost}
          >
            <LinearProgressIndicator
              color={colors.accent}
              drawStopIndicator={{ stopSize: 0 }}
              gapSize={0}
              modifiers={[fillMaxWidth(), height(6)]}
              progress={committedProgress}
              strokeCap="round"
              trackColor={colors.surface}
            />
          </Host>
        </View>
      ) : null}

      {overlayVisible ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close reader controls"
            onPress={closeOverlay}
            style={styles.overlayDismissArea}
          />

          <View style={[styles.topBar, { paddingTop: headerTop }]}>
            <View style={styles.topActionsRow}>
              <Host
                colorScheme={colorScheme}
                seedColor={colors.accent}
                style={stylesStatic.iconButtonHost}
              >
                <IconButton
                  colors={{
                    containerColor: colors.surface,
                    contentColor: colors.text,
                  }}
                  onClick={() => {
                    router.replace("/");
                  }}
                  modifiers={[size(44, 44)]}
                >
                  <Icon source={arrowBackIcon} size={24} tint={colors.text} />
                </IconButton>
              </Host>
              <View style={styles.readerActions}>
                {onToggleBookmark ? (
                  <ReaderComposeIconButton
                    accessibilityLabel={
                      isBookmarked ? "Remove bookmark" : "Add bookmark"
                    }
                    colorScheme={colorScheme}
                    colors={colors}
                    icon={isBookmarked ? bookmarkRemoveIcon : bookmarkAddIcon}
                    onPress={handleBookmarkPress}
                  />
                ) : null}
                <ReaderComposeIconButton
                  accessibilityLabel="Contents"
                  colorScheme={colorScheme}
                  colors={colors}
                  icon={formatListBulletedIcon}
                  onPress={() => setIsContentsVisible(true)}
                />
                {onReaderAppearanceChange ? (
                  <ReaderComposeIconButton
                    accessibilityLabel={
                      readerAppearance === "night"
                        ? "Use day mode"
                        : "Use night mode"
                    }
                    colorScheme={colorScheme}
                    colors={colors}
                    icon={
                      readerAppearance === "night"
                        ? lightModeIcon
                        : darkModeIcon
                    }
                    onPress={handleAppearancePress}
                  />
                ) : null}
                {onZoomLockChange ? (
                  <ReaderComposeIconButton
                    accessibilityLabel={
                      isZoomLocked ? "Unlock zoom" : "Lock zoom"
                    }
                    colorScheme={colorScheme}
                    colors={colors}
                    icon={isZoomLocked ? lockIcon : lockOpenIcon}
                    onPress={() => setZoomLocked(!isZoomLocked)}
                  />
                ) : null}
              </View>
            </View>
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.headerTitle}
            >
              {titleText}
            </Text>
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.headerAuthor}
            >
              {authorText}
            </Text>
          </View>

          <View
            style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
          >
            <View style={styles.progressHeader}>
              <TextInput
                keyboardType="number-pad"
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.progressText, styles.pageInput]}
                value={pageInputValue ?? String(draftPageNumber)}
                onChangeText={setPageInputValue}
                onBlur={() => setPageInputValue(null)}
                onSubmitEditing={(e) => {
                  const val = parseInt(e.nativeEvent.text, 10);
                  if (!isNaN(val)) {
                    onPageSelect?.(val);
                  }
                  setPageInputValue(null);
                }}
              />
              {pageCount ? (
                <Text style={styles.progressText}> / {pageCount}</Text>
              ) : null}
            </View>

            <GestureDetector gesture={sliderGesture}>
              <View
                accessibilityLabel="Reading position"
                accessibilityRole="adjustable"
                onLayout={(event) => {
                  setSliderWidth(event.nativeEvent.layout.width);
                }}
                style={styles.detailedSliderTouchArea}
              >
                <View style={styles.detailedSliderTrack}>
                  <View
                    style={[
                      styles.detailedSliderFill,
                      { width: `${draftProgress * 100}%` },
                    ]}
                  />
                  {pageCount
                    ? visibleChapters.map((chapter) => (
                        <View
                          key={`${chapter.pageNumber}-${chapter.title}`}
                          pointerEvents="none"
                          style={[
                            styles.chapterMarker,
                            {
                              left: `${
                                pageToRatio(chapter.pageNumber, pageCount) * 100
                              }%`,
                            },
                          ]}
                        />
                      ))
                    : null}
                  {pageCount
                    ? visibleBookmarks.map((bookmark) => (
                        <View
                          key={`${bookmark.pageNumber}-${bookmark.title ?? "bookmark"}`}
                          pointerEvents="none"
                          style={[
                            styles.bookmarkMarker,
                            {
                              left: `${
                                pageToRatio(bookmark.pageNumber, pageCount) *
                                100
                              }%`,
                            },
                          ]}
                        />
                      ))
                    : null}
                  <View
                    pointerEvents="none"
                    style={[
                      styles.sliderThumb,
                      { left: `${draftProgress * 100}%` },
                    ]}
                  />
                </View>
              </View>
            </GestureDetector>

            <Text numberOfLines={1} selectable style={styles.chapterTitle}>
              {chapterLabel}
            </Text>
          </View>
        </View>
      ) : null}

      <ReaderContentsModal
        bookmarks={bookmarks}
        chapters={chapters}
        colors={colors}
        isVisible={isContentsVisible}
        onClose={() => setIsContentsVisible(false)}
        onDeleteBookmark={onDeleteBookmark}
        onPageSelect={(nextPage) => onPageSelect?.(nextPage)}
        onRenameBookmark={onRenameBookmark}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background,
      flex: 1,
      overflow: "hidden",
    },
    pageGestureLayer: {
      flex: 1,
    },
    pageLayer: {
      backgroundColor: colors.background,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    overlay: {
      bottom: 0,
      justifyContent: "space-between",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    overlayDismissArea: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    compactProgressWrap: {
      height: 6,
      justifyContent: "center",
      left: 28,
      position: "absolute",
      right: 28,
    },
    compactProgressHost: {
      height: 6,
      width: "100%",
    },
    topBar: {
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 2,
      paddingBottom: 10,
      paddingHorizontal: 18,
      zIndex: 2,
    },
    topActionsRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    readerActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    headerTitle: {
      color: colors.text,
      fontFamily: fonts.semiBold,
      fontSize: 14,
      lineHeight: 18,
      paddingTop: 2,
    },
    headerAuthor: {
      color: colors.textSubtle,
      fontFamily: fonts.medium,
      fontSize: 12,
      lineHeight: 16,
    },
    bottomBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
      paddingHorizontal: 18,
      paddingTop: 14,
      zIndex: 2,
    },
    progressHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
    },
    pageInput: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 4,
      minWidth: 44,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    chapterTitle: {
      color: colors.textSubtle,
      fontFamily: fonts.medium,
      fontSize: 12,
      lineHeight: 16,
      textAlign: "center",
    },
    detailedSliderTouchArea: {
      height: 34,
      justifyContent: "center",
      width: "100%",
    },
    detailedSliderTrack: {
      backgroundColor: colors.border,
      borderRadius: 1,
      height: 2,
      position: "relative",
      width: "100%",
    },
    detailedSliderFill: {
      backgroundColor: colors.accent,
      borderRadius: 1,
      height: 2,
    },
    chapterMarker: {
      backgroundColor: colors.textSubtle,
      height: 6,
      marginLeft: -0.5,
      position: "absolute",
      top: -2,
      width: 1,
    },
    bookmarkMarker: {
      backgroundColor: colors.warning,
      borderRadius: 2,
      height: 5,
      marginLeft: -2.5,
      position: "absolute",
      top: -1.5,
      transform: [{ rotate: "45deg" }],
      width: 5,
    },
    sliderThumb: {
      backgroundColor: colors.accent,
      borderColor: colors.surface,
      borderRadius: SLIDER_THUMB_SIZE / 2,
      borderWidth: 2,
      height: SLIDER_THUMB_SIZE,
      marginLeft: -SLIDER_THUMB_SIZE / 2,
      position: "absolute",
      top: -(SLIDER_THUMB_SIZE - 2) / 2,
      width: SLIDER_THUMB_SIZE,
    },
    progressText: {
      color: colors.text,
      fontFamily: fonts.semiBold,
      fontSize: 14,
      fontVariant: ["tabular-nums"],
      lineHeight: 18,
      textAlign: "center",
    },
  });
