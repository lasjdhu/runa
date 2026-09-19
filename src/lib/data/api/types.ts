import type { Book, SupportedBookExtension } from "@/lib/types";

export type BookRecordStatus = "active" | "trashed" | "skipped" | "deleted";
export type BookLocationOrigin = "scan" | "import" | "manual";
export type BookRendererKind = "pdf-native" | "epub-rn" | "fb2-rn";

export type LibraryBookRecord = {
  id: string;
  extension: SupportedBookExtension;
  archive: Book["archive"] | null;
  status: BookRecordStatus;
  title: string;
  author: string | null;
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  language: string | null;
  isbn: string | null;
  series: string | null;
  seriesIndex: number | null;
  coverUri: string | null;
  contentFingerprint: string | null;
  metadataFingerprint: string;
  duplicateGroupId: string | null;
  isStarred: boolean;
  currentPosition: string | null;
  progress: number;
  pageCount: number | null;
  primaryUri: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScannedBookInput = Book & {
  contentFingerprint?: string;
  pageCount?: number;
};

export type UpsertLibraryBooksResult = {
  inserted: number;
  updated: number;
  skipped: number;
  missing: number;
  activeBookIds: string[];
};

export type PagePrecachePlan = {
  currentPage: number;
  radius: number;
  keep: number[];
  render: number[];
  evict: number[];
};

export type BookBookmarkRecord = {
  id: string;
  bookId: string;
  rendererKind: BookRendererKind;
  pageNumber: number;
  positionPayload: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};
