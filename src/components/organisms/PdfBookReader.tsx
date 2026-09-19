import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookLoadingIndicator } from "@/components/organisms/BookLoadingIndicator";
import {
  ReaderPageFrame,
  type ReaderBookmarkMarker,
  type ReaderChapterMarker,
} from "@/components/organisms/ReaderPageFrame";
import { TextInputDialog } from "@/components/molecules";
import { type AppColors, useAppColors } from "@/lib/config/colors";
import { fonts } from "@/lib/config/constants";
import {
  getBookRecord,
  listBookBookmarks,
  markBookOpened,
  setBookPageBookmarked,
  trashBook,
  updateBookProgress,
} from "@/lib/data/api";
import {
  PageWindowCache,
  parseNativePdfChapters,
  renderNativePdfPage,
} from "@/lib/reader";
import {
  formatPdfOpenError,
  getSavedPosition,
  isEncryptedPdfError,
  isMissingFileError,
  type ReaderZoomState,
} from "@/lib/reader/utils";
import { useSettingsStore } from "@/lib/store";

type PdfPage = {
  uri: string;
  page: number;
  totalPages: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  renderScale: number;
  backgroundColor: string;
};

function getPdfRenderScale(zoomState: ReaderZoomState | null) {
  if (!zoomState) {
    return 1;
  }

  return Math.min(Math.max(Math.ceil(zoomState.scale * 2) / 2, 1), 3);
}

function getPdfRendererSource(uri: string) {
  try {
    return decodeURI(uri);
  } catch {
    return uri;
  }
}

export function PdfBookReader({
  bookId,
  uri,
}: {
  bookId?: string;
  uri: string;
}) {
  const source = useMemo(() => getPdfRendererSource(uri), [uri]);

  return <PdfBookReaderContent bookId={bookId} key={source} source={source} />;
}

function PdfBookReaderContent({
  bookId,
  source,
}: {
  bookId?: string;
  source: string;
}) {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const readerAppearance = useSettingsStore((state) => state.readerAppearance);
  const setReaderAppearance = useSettingsStore(
    (state) => state.setReaderAppearance,
  );
  const mountedRef = useRef(true);
  const [activeSource, setActiveSource] = useState(source);
  const [pdfPassword, setPdfPassword] = useState<string | null>(null);
  const [passwordAttempt, setPasswordAttempt] = useState(0);
  const [renderScale, setRenderScale] = useState(1);
  const cache = useMemo(
    () =>
      new PageWindowCache<PdfPage>(
        (pageToRender) =>
          renderNativePdfPage(
            activeSource,
            pageToRender,
            readerAppearance,
            pdfPassword,
            renderScale,
          ),
        1,
      ),
    [activeSource, pdfPassword, readerAppearance, renderScale],
  );
  const warmRequestRef = useRef(0);
  const navigationRequestRef = useRef(0);
  const pageRef = useRef(0);
  const pageCountRef = useRef<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [renderedPage, setRenderedPage] = useState<PdfPage | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canTrashMissingBook, setCanTrashMissingBook] = useState(false);
  const [isTrashingMissingBook, setIsTrashingMissingBook] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [bookmarkPromptDefault, setBookmarkPromptDefault] = useState<
    string | null
  >(null);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [bookAuthor, setBookAuthor] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ReaderChapterMarker[]>([]);
  const [bookmarks, setBookmarks] = useState<ReaderBookmarkMarker[]>([]);
  const [isZoomLocked, setIsZoomLocked] = useState(false);
  const [lockedZoomState, setLockedZoomState] =
    useState<ReaderZoomState | null>(null);
  const latestProgressRef = useRef<{
    page: number;
    pageCount: number | null;
    isZoomLocked: boolean;
    zoomState: ReaderZoomState | null;
  }>({ page: 0, pageCount: null, isZoomLocked: false, zoomState: null });
  const progressWritePromiseRef = useRef(Promise.resolve());
  const progressWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const initialLoadKeyRef = useRef<string | null>(null);
  const initialLoadKey = `${activeSource}:${pdfPassword ?? ""}:${passwordAttempt}`;

  const queueProgressWrite = useCallback(
    (
      nextPage: number,
      nextPageCount: number | null,
      nextZoomLocked: boolean,
      nextZoomState: ReaderZoomState | null,
      immediate = false,
    ) => {
      if (!bookId) {
        return;
      }

      if (progressWriteTimeoutRef.current) {
        clearTimeout(progressWriteTimeoutRef.current);
      }

      const executeWrite = async () => {
        progressWriteTimeoutRef.current = null;

        const progress =
          nextPageCount && nextPageCount > 1
            ? (nextPage / (nextPageCount - 1)) * 100
            : 0;

        progressWritePromiseRef.current = progressWritePromiseRef.current
          .catch(() => undefined)
          .then(() =>
            updateBookProgress({
              bookId,
              currentPosition: JSON.stringify({
                page: nextPage,
                isZoomLocked: nextZoomLocked,
                zoomState: nextZoomLocked ? nextZoomState : null,
              }),
              pageCount: nextPageCount,
              progress,
            }),
          )
          .catch(() => undefined);

        await progressWritePromiseRef.current;
      };

      if (immediate) {
        void executeWrite();
      } else {
        progressWriteTimeoutRef.current = setTimeout(() => {
          void executeWrite();
        }, 800);
      }
    },
    [bookId],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void queueProgressWrite(
          latestProgressRef.current.page,
          latestProgressRef.current.pageCount,
          latestProgressRef.current.isZoomLocked,
          latestProgressRef.current.zoomState,
          true,
        );
      }
    });

    return () => {
      sub.remove();
      void queueProgressWrite(
        latestProgressRef.current.page,
        latestProgressRef.current.pageCount,
        latestProgressRef.current.isZoomLocked,
        latestProgressRef.current.zoomState,
        true,
      );
    };
  }, [queueProgressWrite]);

  const warmPageWindow = useCallback(
    async (currentPage: number, knownPageCount: number | null) => {
      const requestId = ++warmRequestRef.current;

      await cache.warm(currentPage, knownPageCount);

      if (!mountedRef.current || requestId !== warmRequestRef.current) {
        return null;
      }

      const currentCachedPage = cache.get(currentPage);

      void Image.prefetch(
        cache
          .pages()
          .map((cachedPageNumber) => cache.get(cachedPageNumber)?.uri)
          .filter((cachedUri): cachedUri is string => Boolean(cachedUri)),
        "memory-disk",
      ).catch(() => undefined);

      return currentCachedPage;
    },
    [cache],
  );

  const commitPage = useCallback(
    async (nextPage: number, nextRenderedPage: PdfPage) => {
      await Image.prefetch(nextRenderedPage.uri, "memory-disk").catch(
        () => false,
      );

      if (!mountedRef.current) {
        return;
      }

      pageRef.current = nextPage;
      pageCountRef.current = nextRenderedPage.totalPages;
      setPage(nextPage);
      setRenderedPage(nextRenderedPage);
      setPageCount(nextRenderedPage.totalPages);
      latestProgressRef.current = {
        page: nextPage,
        pageCount: nextRenderedPage.totalPages,
        isZoomLocked,
        zoomState: lockedZoomState,
      };
      void queueProgressWrite(
        nextPage,
        nextRenderedPage.totalPages,
        isZoomLocked,
        lockedZoomState,
      );
    },
    [isZoomLocked, lockedZoomState, queueProgressWrite],
  );

  const refreshBookmarks = useCallback(async () => {
    if (!bookId) {
      setBookmarks([]);
      return;
    }

    const nextBookmarks = await listBookBookmarks(bookId);

    if (!mountedRef.current) {
      return;
    }

    setBookmarks(
      nextBookmarks.map((bookmark) => ({
        pageNumber: bookmark.pageNumber,
        title: bookmark.label,
      })),
    );
  }, [bookId]);

  useEffect(() => {
    if (initialLoadKeyRef.current === initialLoadKey) {
      return;
    }

    initialLoadKeyRef.current = initialLoadKey;

    let canceled = false;
    let redirectedToCanonicalSource = false;

    const loadInitialWindow = async () => {
      try {
        const record = bookId ? await getBookRecord(bookId) : null;
        const canonicalSource = getPdfRendererSource(
          record?.primaryUri ?? source,
        );

        if (canonicalSource !== activeSource) {
          redirectedToCanonicalSource = true;
          setActiveSource(canonicalSource);
          return;
        }

        const [parsedChapters, storedBookmarks] = await Promise.all([
          parseNativePdfChapters(activeSource).catch(() => []),
          bookId ? listBookBookmarks(bookId) : Promise.resolve([]),
        ]);
        const savedPos = getSavedPosition(record?.currentPosition);

        if (bookId) {
          await markBookOpened(bookId);
        }
        await cache.warm(0, 1);
        const firstPageForCount = cache.get(0);

        if (!firstPageForCount) {
          throw new Error("Unable to render first PDF page");
        }

        const initialPage = Math.min(
          savedPos.page,
          firstPageForCount.totalPages - 1,
        );

        await cache.warm(initialPage, firstPageForCount.totalPages);
        const initialRenderedPage = cache.get(initialPage) ?? firstPageForCount;

        if (!canceled && mountedRef.current) {
          setError(null);
          setCanTrashMissingBook(false);
          setNeedsPassword(false);
          setBookTitle(record?.title ?? null);
          setBookAuthor(record?.author ?? null);
          setChapters(
            parsedChapters.map((chapter) => ({
              pageNumber: chapter.page + 1,
              title: chapter.title,
            })),
          );
          setBookmarks(
            storedBookmarks.map((bookmark) => ({
              pageNumber: bookmark.pageNumber,
              title: bookmark.label,
            })),
          );
          setIsZoomLocked(savedPos.isZoomLocked);
          setLockedZoomState(savedPos.zoomState);
          setRenderScale(
            savedPos.isZoomLocked ? getPdfRenderScale(savedPos.zoomState) : 1,
          );
          pageRef.current = initialRenderedPage.page;
          pageCountRef.current = initialRenderedPage.totalPages;
          setPage(initialRenderedPage.page);
          setRenderedPage(initialRenderedPage);
          setPageCount(initialRenderedPage.totalPages);
          latestProgressRef.current = {
            page: initialRenderedPage.page,
            pageCount: initialRenderedPage.totalPages,
            isZoomLocked: savedPos.isZoomLocked,
            zoomState: savedPos.zoomState,
          };
        }
      } catch (loadError) {
        if (!canceled && mountedRef.current) {
          const encrypted = isEncryptedPdfError(loadError);
          const missingFile = !encrypted && isMissingFileError(loadError);
          setNeedsPassword(encrypted);
          setCanTrashMissingBook(missingFile);
          setError(
            encrypted ? "This PDF is encrypted" : formatPdfOpenError(loadError),
          );
        }
      } finally {
        if (!canceled && mountedRef.current && !redirectedToCanonicalSource) {
          setIsInitialLoading(false);
        }
      }
    };

    void loadInitialWindow();

    return () => {
      canceled = true;
    };
  }, [activeSource, bookId, cache, initialLoadKey, source]);

  useEffect(() => {
    if (pageCountRef.current === null) {
      return;
    }

    const rewarm = async () => {
      try {
        const currentPage = pageRef.current;
        const currentPageCount = pageCountRef.current;
        const warmedPage = await warmPageWindow(currentPage, currentPageCount);
        if (warmedPage && mountedRef.current) {
          setRenderedPage(warmedPage);
          setError(null);
          setCanTrashMissingBook(false);
          setNeedsPassword(false);
        }
      } catch (renderError) {
        if (!mountedRef.current) {
          return;
        }

        if (!renderedPage) {
          const encrypted = isEncryptedPdfError(renderError);
          const missingFile = !encrypted && isMissingFileError(renderError);
          setNeedsPassword(encrypted);
          setCanTrashMissingBook(missingFile);
          setError(
            encrypted
              ? "This PDF is encrypted"
              : formatPdfOpenError(renderError),
          );
        }
      }
    };

    void rewarm();

    return () => {
      cache.clear();
    };
  }, [cache, renderedPage, warmPageWindow]);

  const navigateBy = useCallback(
    async (delta: -1 | 1) => {
      const currentPage = pageRef.current;
      const currentPageCount = pageCountRef.current;
      const upperBound =
        currentPageCount !== null ? currentPageCount - 1 : currentPage + 1;
      const nextPage = Math.min(Math.max(0, currentPage + delta), upperBound);

      if (nextPage === currentPage) {
        return;
      }

      const requestId = ++navigationRequestRef.current;
      const cachedPage = cache.get(nextPage);

      if (cachedPage) {
        await commitPage(nextPage, cachedPage);
        void warmPageWindow(nextPage, cachedPage.totalPages);
        return;
      }

      const warmedPage = await warmPageWindow(nextPage, currentPageCount);

      if (
        !mountedRef.current ||
        requestId !== navigationRequestRef.current ||
        !warmedPage
      ) {
        return;
      }

      await commitPage(nextPage, warmedPage);
      void warmPageWindow(nextPage, warmedPage.totalPages);
    },
    [cache, commitPage, warmPageWindow],
  );

  const goBack = useCallback(() => {
    void navigateBy(-1);
  }, [navigateBy]);

  const goForward = useCallback(() => {
    void navigateBy(1);
  }, [navigateBy]);
  const goToPageNumber = useCallback(
    async (nextPageNumber: number) => {
      const currentPageCount = pageCountRef.current;
      const upperBound = currentPageCount !== null ? currentPageCount : 1;
      const nextPage =
        Math.min(Math.max(1, Math.round(nextPageNumber)), upperBound) - 1;

      if (nextPage === pageRef.current) {
        return;
      }

      const requestId = ++navigationRequestRef.current;
      const cachedPage = cache.get(nextPage);

      if (cachedPage) {
        await commitPage(nextPage, cachedPage);
        void warmPageWindow(nextPage, cachedPage.totalPages);
        return;
      }

      const warmedPage = await warmPageWindow(nextPage, currentPageCount);

      if (
        !mountedRef.current ||
        requestId !== navigationRequestRef.current ||
        !warmedPage
      ) {
        return;
      }

      await commitPage(nextPage, warmedPage);
      void warmPageWindow(nextPage, warmedPage.totalPages);
    },
    [cache, commitPage, warmPageWindow],
  );
  const isLastPage = pageCount !== null ? page >= pageCount - 1 : false;
  const canGoBack = page > 0;
  const canGoForward = !isLastPage;
  const currentPageNumber = page + 1;
  const isCurrentPageBookmarked = bookmarks.some(
    (bookmark) => bookmark.pageNumber === currentPageNumber,
  );
  const toggleBookmark = useCallback(() => {
    if (!bookId) {
      return;
    }

    const nextBookmarked = !isCurrentPageBookmarked;

    if (nextBookmarked) {
      setBookmarkPromptDefault(`Bookmark ${bookmarks.length + 1}`);
      return;
    }

    const bookmarkPageNumber = pageRef.current + 1;
    const currentChapter =
      chapters.findLast((chapter) => chapter.pageNumber <= bookmarkPageNumber)
        ?.title ?? null;

    void setBookPageBookmarked({
      bookId,
      isBookmarked: nextBookmarked,
      label: currentChapter,
      pageNumber: bookmarkPageNumber,
      positionPayload: JSON.stringify({
        page: pageRef.current,
        isZoomLocked,
        zoomState: isZoomLocked ? lockedZoomState : null,
      }),
      rendererKind: "pdf-native",
    }).then(refreshBookmarks);
  }, [
    bookId,
    bookmarks.length,
    chapters,
    isCurrentPageBookmarked,
    isZoomLocked,
    lockedZoomState,
    refreshBookmarks,
  ]);

  const saveBookmark = useCallback(
    (label: string) => {
      if (!bookId || !bookmarkPromptDefault) {
        return;
      }

      const bookmarkPageNumber = pageRef.current + 1;
      const normalizedLabel = label.trim() || bookmarkPromptDefault;

      setBookmarkPromptDefault(null);

      void setBookPageBookmarked({
        bookId,
        isBookmarked: true,
        label: normalizedLabel,
        pageNumber: bookmarkPageNumber,
        positionPayload: JSON.stringify({
          page: pageRef.current,
          isZoomLocked,
          zoomState: isZoomLocked ? lockedZoomState : null,
        }),
        rendererKind: "pdf-native",
      }).then(refreshBookmarks);
    },
    [
      bookId,
      bookmarkPromptDefault,
      isZoomLocked,
      lockedZoomState,
      refreshBookmarks,
    ],
  );

  const renameBookmark = useCallback(
    (bookmarkPageNumber: number, title: string) => {
      if (!bookId) {
        return;
      }

      const normalizedTitle =
        title.trim() || `Bookmark on page ${bookmarkPageNumber}`;

      void setBookPageBookmarked({
        bookId,
        isBookmarked: true,
        label: normalizedTitle,
        pageNumber: bookmarkPageNumber,
        positionPayload: JSON.stringify({
          page: bookmarkPageNumber - 1,
          isZoomLocked,
          zoomState: isZoomLocked ? lockedZoomState : null,
        }),
        rendererKind: "pdf-native",
      }).then(refreshBookmarks);
    },
    [bookId, isZoomLocked, lockedZoomState, refreshBookmarks],
  );

  const deleteBookmark = useCallback(
    (bookmarkPageNumber: number) => {
      if (!bookId) {
        return;
      }

      void setBookPageBookmarked({
        bookId,
        isBookmarked: false,
        pageNumber: bookmarkPageNumber,
        positionPayload: JSON.stringify({
          page: bookmarkPageNumber - 1,
          isZoomLocked,
          zoomState: isZoomLocked ? lockedZoomState : null,
        }),
        rendererKind: "pdf-native",
      }).then(refreshBookmarks);
    },
    [bookId, isZoomLocked, lockedZoomState, refreshBookmarks],
  );

  const returnToLibrary = useCallback(() => {
    router.replace("/");
  }, []);

  const trashMissingBook = useCallback(() => {
    setIsTrashingMissingBook(true);

    if (!bookId) {
      requestAnimationFrame(returnToLibrary);
      return;
    }

    requestAnimationFrame(() => {
      returnToLibrary();
      void trashBook(bookId).catch(() => undefined);
    });
  }, [bookId, returnToLibrary]);

  const submitPassword = useCallback((password: string) => {
    setNeedsPassword(false);
    setError(null);
    setRenderedPage(null);
    setIsInitialLoading(true);
    setPdfPassword(password);
    setPasswordAttempt((attempt) => attempt + 1);
  }, []);

  if (isInitialLoading && !renderedPage) {
    return <BookLoadingIndicator />;
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Pressable
          accessibilityLabel="Back to library"
          onPress={returnToLibrary}
          style={[styles.errorBackButton, { top: insets.top + 12 }]}
        >
          <ArrowLeft color={colors.text} size={24} strokeWidth={2} />
        </Pressable>
        <View style={styles.messageContainer}>
          <Text selectable style={styles.message}>
            {error}
          </Text>
          {canTrashMissingBook && bookId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                trashMissingBook();
              }}
              disabled={isTrashingMissingBook}
              style={styles.trashMissingButton}
            >
              <Text style={styles.trashMissingButtonText}>
                {isTrashingMissingBook ? "Cleaning..." : "Move book to trash"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {needsPassword ? (
          <TextInputDialog
            confirmLabel="Unlock"
            defaultValue=""
            inputMode="password"
            message="Enter the PDF password to open this book."
            onConfirm={submitPassword}
            onDismiss={() => {
              setNeedsPassword(false);
            }}
            title="Encrypted PDF"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderedPage ? (
        <ReaderPageFrame
          author={bookAuthor}
          bookmarks={bookmarks}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          chapters={chapters}
          isBookmarked={isCurrentPageBookmarked}
          onGoBack={goBack}
          onGoForward={goForward}
          onDeleteBookmark={bookId ? deleteBookmark : undefined}
          onPageSelect={(nextPageNumber) => {
            void goToPageNumber(nextPageNumber);
          }}
          onReaderAppearanceChange={setReaderAppearance}
          onRenameBookmark={bookId ? renameBookmark : undefined}
          onToggleBookmark={bookId ? toggleBookmark : undefined}
          lockedZoomState={lockedZoomState}
          onZoomLockChange={(locked, zoomState) => {
            setIsZoomLocked(locked);
            setLockedZoomState(zoomState);
            setRenderScale(locked ? getPdfRenderScale(zoomState) : 1);
            latestProgressRef.current = {
              page: pageRef.current,
              pageCount: pageCountRef.current,
              isZoomLocked: locked,
              zoomState,
            };
            void queueProgressWrite(
              pageRef.current,
              pageCountRef.current,
              locked,
              zoomState,
            );
          }}
          onZoomStateChange={(zoomState) => {
            if (isZoomLocked) {
              return;
            }

            setRenderScale(getPdfRenderScale(zoomState));
          }}
          isZoomLocked={isZoomLocked}
          pageBackgroundColor={renderedPage.backgroundColor}
          pageCount={pageCount}
          pageKey={currentPageNumber.toString()}
          pageNumber={currentPageNumber}
          readerAppearance={readerAppearance}
          title={bookTitle}
        >
          <Image
            cachePolicy="memory-disk"
            contentFit="contain"
            source={{ uri: renderedPage.uri }}
            style={styles.page}
          />
        </ReaderPageFrame>
      ) : null}
      {bookmarkPromptDefault ? (
        <TextInputDialog
          autoSelect
          defaultValue={bookmarkPromptDefault}
          key={bookmarkPromptDefault}
          onConfirm={saveBookmark}
          onDismiss={() => {
            setBookmarkPromptDefault(null);
          }}
          title="Add bookmark"
        />
      ) : null}
      {needsPassword ? (
        <TextInputDialog
          confirmLabel="Unlock"
          defaultValue=""
          inputMode="password"
          message="Enter the PDF password to open this book."
          onConfirm={submitPassword}
          onDismiss={() => {
            setNeedsPassword(false);
          }}
          title="Encrypted PDF"
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background,
      flex: 1,
    },
    page: {
      height: "100%",
      width: "100%",
    },
    messageContainer: {
      alignItems: "center",
      backgroundColor: colors.background,
      gap: 18,
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    message: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 20,
      textAlign: "center",
    },
    errorBackButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      left: 18,
      position: "absolute",
      width: 44,
      zIndex: 2,
    },
    trashMissingButton: {
      backgroundColor: colors.danger,
      borderRadius: 6,
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    trashMissingButtonText: {
      color: colors.background,
      fontFamily: fonts.semiBold,
      fontSize: 14,
      lineHeight: 18,
    },
  });
