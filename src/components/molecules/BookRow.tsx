import deleteIcon from "@expo/material-symbols/delete.xml";
import moreVertIcon from "@expo/material-symbols/more_vert.xml";
import restoreFromTrashIcon from "@expo/material-symbols/restore_from_trash.xml";
import starIcon from "@expo/material-symbols/star.xml";
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  Icon,
  IconButton,
  LinearProgressIndicator,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import {
  background,
  fillMaxWidth,
  height,
  size,
} from "@expo/ui/jetpack-compose/modifiers";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  type AppColors,
  type AppThemeName,
  useAppColors,
  useResolvedColorScheme,
} from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";
import { type Book } from "@/lib/types";

const coverPlaceholder =
  "|MCY0vxuD%t7~qj[fQfQ_3xu%Mt7D%RjRjt7-;ayt7j[~qofM{ay00ofRjWBt7ay";
const listHorizontalPadding = 36;
const cardHorizontalPadding = 24;
const thumbnailWidth = 88;
const contentGap = 12;

function GeneratedCover({
  colors,
  colorScheme,
  coverFormatLabel,
  isPdf,
  titleInitial,
}: {
  colors: AppColors;
  colorScheme: AppThemeName;
  coverFormatLabel: string;
  isPdf: boolean;
  titleInitial: string;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isLight = colorScheme === "light";

  return (
    <View
      style={[
        styles.generatedCover,
        {
          backgroundColor: isPdf
            ? isLight
              ? "#F4DDE1"
              : colors.accentMuted
            : isLight
              ? colors.background
              : colors.surface,
        },
      ]}
    >
      <View style={styles.generatedCoverTop}>
        <Text
          style={[
            styles.generatedCoverInitial,
            { color: isLight ? colors.accent : colors.text },
          ]}
        >
          {titleInitial}
        </Text>
      </View>
      <View style={styles.generatedCoverBottom}>
        <Text style={styles.generatedCoverFormat}>{coverFormatLabel}</Text>
      </View>
    </View>
  );
}

export const BookRow = memo(function BookRow({
  title,
  author,
  extension,
  archive,
  progress,
  coverBase64,
  isStarred,
  actionMode = "library",
  onPress,
  onRestore,
  onStar,
  onTrash,
  onDeletePermanently,
}: Book & {
  actionMode?: "library" | "trash";
  onPress?: () => void;
  onRestore?: () => void;
  onStar?: () => void;
  onTrash?: () => void;
  onDeletePermanently?: () => void;
}) {
  const colors = useAppColors();
  const colorScheme = useResolvedColorScheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [coverAspectRatio, setCoverAspectRatio] = useState<{
    source: string;
    value: number;
  } | null>(null);
  const parsedProgress = Number.parseFloat(progress);
  const progressValue = Number.isFinite(parsedProgress)
    ? Math.max(0, Math.min(parsedProgress, 100))
    : 0;
  const progressIndicatorValue = progressValue / 100;
  const titleInitial = title.trim().charAt(0).toLocaleUpperCase() || "R";
  const extensionLabel = extension.toUpperCase();
  const formatLabel = archive
    ? `${extensionLabel} in ${archive.toUpperCase()}`
    : extensionLabel;
  const coverFormatLabel = archive
    ? `${extensionLabel}\n${archive.toUpperCase()}`
    : extensionLabel;
  const pdfCoverSource =
    extension === "pdf" && coverBase64?.match(/^file:\/\/.*\.pdf$/i)
      ? coverBase64
      : undefined;
  const coverImageSource = useMemo(
    () => (coverBase64 ? { uri: coverBase64 } : null),
    [coverBase64],
  );
  const measuredCoverAspectRatio =
    coverAspectRatio && coverAspectRatio.source === coverBase64
      ? coverAspectRatio.value
      : null;
  const coverContentFit =
    measuredCoverAspectRatio === null ||
    (measuredCoverAspectRatio >= 0.55 && measuredCoverAspectRatio <= 0.8)
      ? "fill"
      : "contain";
  const cardWidth = Math.max(windowWidth - listHorizontalPadding, 0);
  const contentWidth = Math.max(
    cardWidth - cardHorizontalPadding - thumbnailWidth - contentGap,
    0,
  );
  const closeActionMenu = useCallback(() => {
    setActionMenuOpen(false);
  }, []);
  const handleMenuAction = useCallback((action?: () => void) => {
    setActionMenuOpen(false);
    action?.();
  }, []);
  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.thumbnail}>
        {pdfCoverSource ? (
          <GeneratedCover
            colorScheme={colorScheme}
            colors={colors}
            coverFormatLabel={coverFormatLabel}
            isPdf
            titleInitial={titleInitial}
          />
        ) : coverBase64 ? (
          <Image
            cachePolicy="memory-disk"
            contentFit={coverContentFit}
            onLoad={(event) => {
              const { width, height } = event.source;

              if (width > 0 && height > 0) {
                setCoverAspectRatio({
                  source: coverBase64,
                  value: width / height,
                });
              }
            }}
            placeholder={{ blurhash: coverPlaceholder }}
            placeholderContentFit={coverContentFit}
            priority="low"
            recyclingKey={coverBase64}
            source={coverImageSource}
            style={styles.coverImage}
            transition={260}
          />
        ) : (
          <GeneratedCover
            colorScheme={colorScheme}
            colors={colors}
            coverFormatLabel={coverFormatLabel}
            isPdf={extension === "pdf"}
            titleInitial={titleInitial}
          />
        )}
        {isStarred ? (
          <View
            accessibilityLabel="Starred book"
            pointerEvents="none"
            style={styles.starBadge}
          >
            <Host
              colorScheme={colorScheme}
              matchContents
              seedColor={colors.accent}
            >
              <Icon source={starIcon} size={16} tint={colors.accent} />
            </Host>
          </View>
        ) : null}
      </View>

      <View style={[styles.content, { width: contentWidth }]}>
        <View style={styles.topRow}>
          <View style={styles.textBlock}>
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.title}>
              {title}
            </Text>
            {author ? (
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={styles.author}
              >
                {author}
              </Text>
            ) : null}
            <View style={styles.tag}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={styles.tagText}
              >
                {formatLabel}
              </Text>
            </View>
          </View>

          <Host
            colorScheme={colorScheme}
            matchContents
            seedColor={colors.accent}
            style={styles.menuHost}
          >
            <DropdownMenu
              color={colors.surfaceRaised}
              expanded={actionMenuOpen}
              modifiers={[background(colors.surfaceRaised)]}
              onDismissRequest={closeActionMenu}
            >
              <DropdownMenu.Trigger>
                <IconButton
                  colors={{
                    containerColor: colors.surfaceRaised,
                    contentColor: colors.textMuted,
                  }}
                  modifiers={[size(36, 36), background(colors.surfaceRaised)]}
                  onClick={() => {
                    setActionMenuOpen(true);
                  }}
                >
                  <Icon
                    contentDescription="Book actions"
                    size={22}
                    source={moreVertIcon}
                  />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Items>
                {actionMode === "trash" ? (
                  <>
                    <DropdownMenuItem
                      elementColors={{
                        leadingIconColor: colors.accent,
                        textColor: colors.text,
                      }}
                      onClick={() => {
                        handleMenuAction(onRestore);
                      }}
                    >
                      <DropdownMenuItem.Text>
                        <ComposeText color={colors.text}>Restore</ComposeText>
                      </DropdownMenuItem.Text>
                      <DropdownMenuItem.LeadingIcon>
                        <Icon
                          source={restoreFromTrashIcon}
                          size={20}
                          tint={colors.accent}
                        />
                      </DropdownMenuItem.LeadingIcon>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      elementColors={{
                        leadingIconColor: colors.accent,
                        textColor: colors.text,
                      }}
                      onClick={() => {
                        handleMenuAction(onDeletePermanently);
                      }}
                    >
                      <DropdownMenuItem.Text>
                        <ComposeText color={colors.text}>
                          Delete from device
                        </ComposeText>
                      </DropdownMenuItem.Text>
                      <DropdownMenuItem.LeadingIcon>
                        <Icon
                          source={deleteIcon}
                          size={20}
                          tint={colors.accent}
                        />
                      </DropdownMenuItem.LeadingIcon>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem
                      elementColors={{
                        leadingIconColor: colors.accent,
                        textColor: colors.text,
                      }}
                      onClick={() => {
                        handleMenuAction(onStar);
                      }}
                    >
                      <DropdownMenuItem.Text>
                        <ComposeText color={colors.text}>
                          {isStarred ? "Unstar" : "Star"}
                        </ComposeText>
                      </DropdownMenuItem.Text>
                      <DropdownMenuItem.LeadingIcon>
                        <Icon
                          source={starIcon}
                          size={20}
                          tint={colors.accent}
                        />
                      </DropdownMenuItem.LeadingIcon>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      elementColors={{
                        leadingIconColor: colors.accent,
                        textColor: colors.text,
                      }}
                      onClick={() => {
                        handleMenuAction(onTrash);
                      }}
                    >
                      <DropdownMenuItem.Text>
                        <ComposeText color={colors.text}>
                          Move to trash
                        </ComposeText>
                      </DropdownMenuItem.Text>
                      <DropdownMenuItem.LeadingIcon>
                        <Icon
                          source={deleteIcon}
                          size={20}
                          tint={colors.accent}
                        />
                      </DropdownMenuItem.LeadingIcon>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenu.Items>
            </DropdownMenu>
          </Host>
        </View>

        <View style={styles.progressBlock}>
          <Host
            colorScheme={colorScheme}
            seedColor={colors.accent}
            style={styles.progressHost}
          >
            <LinearProgressIndicator
              color={colors.accent}
              drawStopIndicator={{ stopSize: 0 }}
              gapSize={0}
              modifiers={[fillMaxWidth(), height(6)]}
              progress={progressIndicatorValue}
              strokeCap="round"
              trackColor={colors.surface}
            />
          </Host>
          <Text numberOfLines={1} style={styles.progressText}>
            {progress}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.border,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      height: 156,
      overflow: "hidden",
      padding: 12,
      position: "relative",
    },
    cardPressed: {
      opacity: 0.72,
    },
    thumbnail: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 6,
      height: 132,
      overflow: "hidden",
      position: "relative",
      width: 88,
    },
    coverImage: {
      height: "100%",
      width: "100%",
    },
    starBadge: {
      alignItems: "center",
      backgroundColor: colors.surfaceRaised,
      borderBottomLeftRadius: 6,
      height: 25,
      justifyContent: "center",
      position: "absolute",
      right: 0,
      top: 0,
      width: 25,
    },
    generatedCover: {
      height: "100%",
      justifyContent: "space-between",
      width: "100%",
    },
    generatedCoverTop: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    generatedCoverInitial: {
      fontFamily: fonts.bold,
      fontSize: 28,
      lineHeight: 32,
    },
    generatedCoverBottom: {
      backgroundColor: colors.accent,
      minHeight: 22,
      justifyContent: "center",
      paddingVertical: 4,
    },
    generatedCoverFormat: {
      color: colors.background,
      fontFamily: fonts.bold,
      fontSize: 9,
      lineHeight: 10,
      textAlign: "center",
    },
    content: {
      flexShrink: 1,
      justifyContent: "space-between",
      maxHeight: 132,
      minWidth: 0,
    },
    topRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      minHeight: 0,
      paddingRight: 2,
    },
    textBlock: {
      flex: 1,
      gap: 5,
      minWidth: 0,
      paddingRight: 2,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.semiBold,
      fontSize: 15,
      lineHeight: 19,
    },
    author: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 17,
    },
    tag: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderRadius: 999,
      maxWidth: "100%",
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagText: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 11,
      lineHeight: 13,
    },
    progressBlock: {
      gap: 6,
      height: 27,
      overflow: "hidden",
      width: "100%",
    },
    progressHost: {
      height: 6,
      width: "100%",
    },
    progressText: {
      color: colors.textSubtle,
      fontFamily: fonts.medium,
      fontSize: 12,
      lineHeight: 15,
    },
    menuHost: {
      height: 36,
      width: 36,
    },
  });
