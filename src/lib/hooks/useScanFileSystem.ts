import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  AppState,
  LayoutAnimation,
  Platform,
  PermissionsAndroid,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as IntentLauncher from "expo-intent-launcher";
import { unzipSync } from "fflate";
import {
  listLibraryBooks,
  starBook,
  trashBook,
  upsertImportedBook,
  upsertScannedBooks,
  type LibraryBookRecord,
} from "@/lib/data/api";
import { extractBookMetadata } from "../utils/bookMetadata";
import { Book, SupportedBookExtension } from "../types";
import { supportedBookExtensions } from "../config/constants";
import { useSettingsStore } from "../store";
import { renderNativePdfPage } from "../reader";
import RunaScanner from "../../../modules/runa-scanner/src";

const APP_PACKAGE = "online.dmitrii.runa";
const IMPORT_DIRECTORY_NAME = "books";
type ScanStatus =
  | "loading"
  | "idle"
  | "scanning"
  | "importing"
  | "invalid-file"
  | "permission-denied"
  | "empty"
  | "ready"
  | "unsupported-platform";
type ScanTrigger = "auto" | "manual";

type BookFileInfo = {
  extension: SupportedBookExtension;
  archive?: "zip";
};

type LibraryState = {
  books: Book[];
  isScanning: boolean;
  hasHydrated: boolean;
  lastPermissionDeniedScanId: number;
  lastPermissionDeniedScanTrigger: ScanTrigger | null;
  activeScanTrigger: ScanTrigger | null;
  searchQuery: string;
  status: ScanStatus;
  initialScanStarted: boolean;
};

const libraryListeners = new Set<() => void>();
let libraryState: LibraryState = {
  books: [],
  isScanning: false,
  hasHydrated: false,
  lastPermissionDeniedScanId: 0,
  lastPermissionDeniedScanTrigger: null,
  activeScanTrigger: null,
  searchQuery: "",
  status: "loading",
  initialScanStarted: false,
};
let importInProgress = false;
let libraryRefreshRequestId = 0;
const pdfCoverCache = new Map<string, string>();

function subscribeToLibraryState(listener: () => void) {
  libraryListeners.add(listener);

  return () => {
    libraryListeners.delete(listener);
  };
}

function getLibrarySnapshot() {
  return libraryState;
}

function setLibraryState(update: Partial<LibraryState>) {
  libraryState = {
    ...libraryState,
    ...update,
  };

  libraryListeners.forEach((listener) => listener());
}

function animateNextLibraryUpdate() {
  LayoutAnimation.configureNext({
    create: {
      duration: 220,
      property: LayoutAnimation.Properties.opacity,
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      duration: 180,
      property: LayoutAnimation.Properties.opacity,
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    duration: 280,
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
  });
}

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

function getPdfRendererSource(uri: string) {
  try {
    return decodeURI(uri);
  } catch {
    return uri;
  }
}

function isPdfCoverSource(book: Book) {
  return (
    book.extension === "pdf" && book.coverBase64?.match(/^file:\/\/.*\.pdf$/i)
  );
}

async function warmPdfCover(book: Book) {
  if (!isPdfCoverSource(book) || !book.coverBase64) {
    return book;
  }

  const source = getPdfRendererSource(book.coverBase64);
  const cachedCover = pdfCoverCache.get(source);

  if (cachedCover) {
    return { ...book, coverBase64: cachedCover };
  }

  try {
    const renderedCover = await renderNativePdfPage(source, 0);

    pdfCoverCache.set(source, renderedCover.uri);
    await Image.prefetch(renderedCover.uri, "memory-disk").catch(() => false);

    return { ...book, coverBase64: renderedCover.uri };
  } catch {
    return { ...book, coverBase64: undefined };
  }
}

async function warmImageCovers(books: Book[]) {
  const imageCoverUris = books
    .map((book) => book.coverBase64)
    .filter(
      (cover): cover is string =>
        typeof cover === "string" && !cover.match(/^file:\/\/.*\.pdf$/i),
    );

  if (imageCoverUris.length === 0) {
    return;
  }

  await Image.prefetch(imageCoverUris, "memory-disk").catch(() => false);
}

async function warmBookCovers(books: Book[]) {
  const warmedBooks: Book[] = [];

  for (const book of books) {
    warmedBooks.push(await warmPdfCover(book));
  }

  await warmImageCovers(warmedBooks);

  return warmedBooks;
}

async function refreshLibraryBooksFromDatabase(
  query = libraryState.searchQuery,
) {
  const requestId = ++libraryRefreshRequestId;
  const records = await listLibraryBooks("active", { query });

  if (requestId !== libraryRefreshRequestId) {
    return libraryState.books;
  }

  const books = await warmBookCovers(records.map(bookRecordToBook));

  animateNextLibraryUpdate();

  const currentStatus = libraryState.status;
  const shouldPreserveStatus =
    currentStatus === "scanning" ||
    currentStatus === "importing" ||
    currentStatus === "invalid-file" ||
    currentStatus === "permission-denied" ||
    currentStatus === "unsupported-platform";

  setLibraryState({
    books,
    hasHydrated: true,
    searchQuery: query,
    status: shouldPreserveStatus
      ? currentStatus
      : books.length > 0
        ? "ready"
        : "empty",
  });

  return books;
}

function sortOptimisticBooks(books: Book[]) {
  return [...books].sort((first, second) => {
    if (first.isStarred === second.isStarred) {
      return 0;
    }

    return first.isStarred ? -1 : 1;
  });
}

function setOptimisticLibraryBooks(books: Book[]) {
  animateNextLibraryUpdate();

  setLibraryState({
    books,
    status: books.length > 0 ? "ready" : "empty",
  });
}

export async function hydrateLibraryForStartup() {
  if (libraryState.hasHydrated) {
    return libraryState.books;
  }

  try {
    return await refreshLibraryBooksFromDatabase();
  } catch {
    setLibraryState({
      hasHydrated: true,
      status: "empty",
    });

    return [];
  }
}

function getFileName(uri: string) {
  const decoded = decodeURIComponent(uri);
  return decoded.split("/").pop()?.split(":").pop() ?? "Unknown book";
}

function getBookFileInfoFromName(uri: string): BookFileInfo | null {
  const fileName = getFileName(uri).toLocaleLowerCase();

  for (const extension of supportedBookExtensions) {
    if (fileName.endsWith(`.${extension}`)) {
      return { extension };
    }

    if (fileName.endsWith(`.${extension}.zip`)) {
      return { extension, archive: "zip" };
    }
  }

  if (fileName.endsWith(".fb2z")) {
    return { extension: "fb2", archive: "zip" };
  }

  return null;
}

async function detectZippedBookInfo(uri: string): Promise<BookFileInfo | null> {
  const fileName = getFileName(uri).toLocaleLowerCase();

  if (!fileName.endsWith(".zip")) {
    return null;
  }

  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
    const entries = Object.keys(unzipSync(bytes)).map((path) =>
      path.toLocaleLowerCase(),
    );

    for (const extension of supportedBookExtensions) {
      if (entries.some((entry) => entry.endsWith(`.${extension}`))) {
        return { extension, archive: "zip" };
      }
    }
  } catch {
    // unreadable or invalid ZIP
  }

  return null;
}

async function getBookFileInfo(uri: string): Promise<BookFileInfo | null> {
  return getBookFileInfoFromName(uri) ?? detectZippedBookInfo(uri);
}

function getTitle(uri: string) {
  const fileName = getFileName(uri);
  return fileName.replace(/\.(fb2|epub|pdf)(\.zip)?$|\.fb2z$|\.zip$/i, "");
}

function joinUri(directoryUri: string, entryName: string) {
  return `${directoryUri.replace(/\/+$/, "")}/${encodeURIComponent(entryName)}`;
}

async function requestAndroidFilePermissions() {
  if (Platform.OS !== "android") {
    return false;
  }

  if (Platform.Version >= 33) {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function checkAndroidScanPermission() {
  if (Platform.OS !== "android") {
    return false;
  }

  if (Platform.Version < 30) {
    return requestAndroidFilePermissions();
  }

  return checkAllFilesPermission();
}

export async function checkAllFilesPermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  if (Platform.Version < 30) {
    return PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    );
  }

  try {
    return await RunaScanner.isAllFilesAccessGrantedAsync();
  } catch {
    return false;
  }
}

export async function openAppAllFilesAccessSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  if (Platform.Version >= 30) {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
        { data: `package:${APP_PACKAGE}` },
      );
      return;
    } catch {
      // some OEMs don't support the app-specific action
    }

    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.MANAGE_ALL_FILES_ACCESS_PERMISSION,
      );
      return;
    } catch {
      // fall through to legacy path
    }
  }

  await requestAndroidFilePermissions();
}

async function getBookFromUri(uri: string): Promise<Book | null> {
  const bookFileInfo = await getBookFileInfo(uri);

  if (!bookFileInfo) {
    return null;
  }

  const filenameStem = getTitle(uri);
  const meta = await extractBookMetadata(uri, bookFileInfo.extension);

  return {
    ...meta,
    title:
      bookFileInfo.extension === "pdf"
        ? filenameStem
        : meta.title || filenameStem,
    extension: bookFileInfo.extension,
    archive: bookFileInfo.archive,
    progress: "0%",
    uri,
  };
}

function waitForInteractions() {
  return new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 500 });
      return;
    }

    setTimeout(resolve, 0);
  });
}

async function ensureImportDirectory() {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  const directoryUri = joinUri(
    FileSystem.documentDirectory,
    IMPORT_DIRECTORY_NAME,
  );

  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });

  return directoryUri;
}

async function getUniqueImportUri(directoryUri: string, fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let index = 0;

  while (true) {
    const candidateName =
      index === 0 ? fileName : `${baseName}-${index + 1}${extension}`;
    const candidateUri = joinUri(directoryUri, candidateName);
    const info = await FileSystem.getInfoAsync(candidateUri);

    if (!info.exists) {
      return candidateUri;
    }

    index += 1;
  }
}

async function importOneBookFile() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: [
      "application/pdf",
      "application/epub+zip",
      "application/zip",
      "application/x-zip-compressed",
      "application/x-fictionbook+xml",
      "application/xml",
      "text/xml",
      "*/*",
    ],
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset) {
    return false;
  }

  const bookFileInfo = getBookFileInfoFromName(asset.name);

  if (!bookFileInfo && !asset.name.toLocaleLowerCase().endsWith(".zip")) {
    return false;
  }

  const directoryUri = await ensureImportDirectory();

  if (!directoryUri) {
    return false;
  }

  const importedUri = await getUniqueImportUri(directoryUri, asset.name);

  await FileSystem.copyAsync({
    from: asset.uri,
    to: importedUri,
  });

  return await getBookFromUri(importedUri);
}

export function useScanFileSystem() {
  const autoscanEnabled = useSettingsStore((state) => state.autoscanEnabled);
  const hasCompletedOnboarding = useSettingsStore(
    (state) => state.hasCompletedOnboarding,
  );
  const settingsHydrated = useSettingsStore((state) => state.hasHydrated);
  const {
    books,
    hasHydrated,
    isScanning,
    lastPermissionDeniedScanId,
    lastPermissionDeniedScanTrigger,
    activeScanTrigger,
    status,
  } = useSyncExternalStore(
    subscribeToLibraryState,
    getLibrarySnapshot,
    getLibrarySnapshot,
  );
  const [hasAllFilesPermission, setHasAllFilesPermission] =
    useState<boolean>(false);

  useEffect(() => {
    const refresh = async () => {
      const granted = await checkAllFilesPermission();
      setHasAllFilesPermission(granted);
    };

    void refresh();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });

    return () => sub.remove();
  }, []);

  const scanForBooks = useCallback(
    async (options?: { force?: boolean; trigger?: ScanTrigger }) => {
      if (libraryState.isScanning) {
        return;
      }

      if (!options?.force && libraryState.initialScanStarted) {
        return;
      }

      if (Platform.OS !== "android") {
        setLibraryState({
          books: [],
          initialScanStarted: true,
          status: "unsupported-platform",
        });
        return;
      }

      setLibraryState({
        activeScanTrigger: options?.trigger ?? "auto",
        isScanning: true,
        status: "scanning",
      });

      try {
        const hasPermissions = await checkAndroidScanPermission();

        setHasAllFilesPermission(hasPermissions);

        if (!hasPermissions) {
          setLibraryState({
            initialScanStarted: false,
            lastPermissionDeniedScanId:
              libraryState.lastPermissionDeniedScanId + 1,
            lastPermissionDeniedScanTrigger: options?.trigger ?? "auto",
            status: "permission-denied",
          });
          return;
        }

        setLibraryState({
          initialScanStarted: true,
          lastPermissionDeniedScanTrigger: null,
        });

        await waitForInteractions();

        const foundBooks = (await RunaScanner.scanForBooksAsync()) as Book[];
        await upsertScannedBooks(foundBooks);
        const nextBooks = await refreshLibraryBooksFromDatabase();

        setLibraryState({
          status: nextBooks.length > 0 ? "ready" : "empty",
        });
      } finally {
        setLibraryState({
          activeScanTrigger: null,
          isScanning: false,
        });
      }
    },
    [],
  );

  const importBook = useCallback(async () => {
    if (Platform.OS !== "android") {
      setLibraryState({
        status: "unsupported-platform",
      });
      return;
    }

    if (importInProgress) {
      return;
    }

    importInProgress = true;

    setLibraryState({
      status: "importing",
    });

    try {
      const importedBook = await importOneBookFile();

      if (importedBook == null) {
        setLibraryState({
          status: libraryState.books.length > 0 ? "ready" : "empty",
        });
        return;
      }

      if (!importedBook) {
        setLibraryState({
          status: "invalid-file",
        });
        return;
      }

      await upsertImportedBook(importedBook);
      const nextBooks = await refreshLibraryBooksFromDatabase();

      setLibraryState({
        status: nextBooks.length > 0 ? "ready" : "empty",
      });
    } finally {
      importInProgress = false;
    }
  }, []);

  const toggleBookStarred = useCallback(async (book: Book) => {
    if (!book.id) {
      return;
    }

    const previousBooks = libraryState.books;
    const nextIsStarred = !book.isStarred;
    const nextBooks = sortOptimisticBooks(
      previousBooks.map((item) =>
        item.id === book.id ? { ...item, isStarred: nextIsStarred } : item,
      ),
    );

    setOptimisticLibraryBooks(nextBooks);

    try {
      await starBook(book.id, nextIsStarred);
      await refreshLibraryBooksFromDatabase();
    } catch {
      setOptimisticLibraryBooks(previousBooks);
    }
  }, []);

  const moveBookToTrash = useCallback(async (book: Book) => {
    if (!book.id) {
      return;
    }

    const previousBooks = libraryState.books;
    const nextBooks = previousBooks.filter((item) => item.id !== book.id);

    setOptimisticLibraryBooks(nextBooks);

    try {
      await trashBook(book.id);
      await refreshLibraryBooksFromDatabase();
    } catch {
      setOptimisticLibraryBooks(previousBooks);
    }
  }, []);
  const refreshLibrary = useCallback(async () => {
    await refreshLibraryBooksFromDatabase();
  }, []);
  const searchLibrary = useCallback(async (query: string) => {
    setLibraryState({ searchQuery: query });
    await refreshLibraryBooksFromDatabase(query);
  }, []);

  useEffect(() => {
    if (hasHydrated) {
      return;
    }

    void hydrateLibraryForStartup();
  }, [hasHydrated]);

  useEffect(() => {
    if (settingsHydrated && hasCompletedOnboarding && autoscanEnabled) {
      void scanForBooks({ trigger: "auto" });
    }
  }, [autoscanEnabled, hasCompletedOnboarding, scanForBooks, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated || !hasCompletedOnboarding || !autoscanEnabled) {
      return;
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void scanForBooks({ trigger: "auto" });
      }
    });

    return () => sub.remove();
  }, [autoscanEnabled, hasCompletedOnboarding, scanForBooks, settingsHydrated]);

  return [
    books,
    scanForBooks,
    importBook,
    isScanning,
    status,
    hasAllFilesPermission,
    lastPermissionDeniedScanId,
    lastPermissionDeniedScanTrigger,
    activeScanTrigger,
    toggleBookStarred,
    moveBookToTrash,
    refreshLibrary,
    searchLibrary,
  ] as const;
}
