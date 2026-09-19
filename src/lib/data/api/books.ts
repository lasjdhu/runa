import type { SQLiteDatabase } from "expo-sqlite";

import { getLibraryDatabase } from "@/lib/data/db";
import type { Book } from "@/lib/types";

import {
  createDuplicateGroupId,
  createId,
  createMetadataFingerprint,
  normalizeBookUri,
  normalizeSearchText,
} from "./identity";
import type {
  BookBookmarkRecord,
  BookLocationOrigin,
  BookRendererKind,
  LibraryBookRecord,
  ScannedBookInput,
  UpsertLibraryBooksResult,
} from "./types";

type BookRow = {
  id: string;
  extension: Book["extension"];
  archive: Book["archive"] | null;
  status: LibraryBookRecord["status"];
  title: string;
  author: string | null;
  publisher: string | null;
  published_date: string | null;
  description: string | null;
  language: string | null;
  isbn: string | null;
  series: string | null;
  series_index: number | null;
  cover_uri: string | null;
  content_fingerprint: string | null;
  metadata_fingerprint: string;
  duplicate_group_id: string | null;
  is_starred: number;
  current_position: string | null;
  progress: number;
  page_count: number | null;
  primary_uri: string | null;
  cover_asset_uri: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

type BookBookmarkRow = {
  id: string;
  book_id: string;
  renderer_kind: BookRendererKind;
  page_number: number;
  position_payload: string;
  label: string | null;
  created_at: string;
  updated_at: string;
};

type ListLibraryBooksOptions = {
  query?: string;
};

function mapBookRow(row: BookRow): LibraryBookRecord {
  return {
    id: row.id,
    extension: row.extension,
    archive: row.archive,
    status: row.status,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    publishedDate: row.published_date,
    description: row.description,
    language: row.language,
    isbn: row.isbn,
    series: row.series,
    seriesIndex: row.series_index,
    coverUri: row.cover_asset_uri ?? row.cover_uri,
    contentFingerprint: row.content_fingerprint,
    metadataFingerprint: row.metadata_fingerprint,
    duplicateGroupId: row.duplicate_group_id,
    isStarred: row.is_starred === 1,
    currentPosition: row.current_position,
    progress: row.progress,
    pageCount: row.page_count,
    primaryUri: row.primary_uri,
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBookBookmarkRow(row: BookBookmarkRow): BookBookmarkRecord {
  return {
    id: row.id,
    bookId: row.book_id,
    rendererKind: row.renderer_kind,
    pageNumber: row.page_number,
    positionPayload: row.position_payload,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProgressNumber(progress: string | undefined) {
  const value = Number.parseFloat(progress ?? "0");

  return Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : 0;
}

function toStoredCoverReference(cover: string | undefined) {
  if (!cover || cover.startsWith("data:")) {
    return null;
  }

  return cover;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function createSearchWhereClause(query: string | undefined) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);

  if (tokens.length === 0) {
    return {
      params: [] as string[],
      sql: "",
    };
  }

  return {
    params: tokens.flatMap((token) => {
      const pattern = `%${escapeLikePattern(token)}%`;

      return [pattern, pattern, pattern, pattern, pattern];
    }),
    sql: tokens
      .map(
        () => `
        AND (
          books.sort_title LIKE ? ESCAPE '\\'
          OR COALESCE(books.sort_author, '') LIKE ? ESCAPE '\\'
          OR COALESCE(books.publisher, '') COLLATE NOCASE LIKE ? ESCAPE '\\'
          OR COALESCE(books.isbn, '') LIKE ? ESCAPE '\\'
          OR books.extension LIKE ? ESCAPE '\\'
        )
      `,
      )
      .join(""),
  };
}

async function upsertBookCoverAsset(
  database: SQLiteDatabase,
  bookId: string,
  cover: string | undefined,
) {
  if (!cover) {
    return;
  }

  await database.runAsync(
    `
    INSERT INTO book_assets (book_id, kind, uri, source, updated_at)
    VALUES (?, 'cover', ?, 'metadata', CURRENT_TIMESTAMP)
    ON CONFLICT(book_id, kind) DO UPDATE SET
      uri = excluded.uri,
      source = excluded.source,
      updated_at = CURRENT_TIMESTAMP
    `,
    bookId,
    cover,
  );
}

async function writeAction(
  database: SQLiteDatabase,
  action: string,
  bookId: string | null,
  payload?: unknown,
) {
  await database.runAsync(
    "INSERT INTO book_actions (id, book_id, action, payload) VALUES (?, ?, ?, ?)",
    createId("action"),
    bookId,
    action,
    payload == null ? null : JSON.stringify(payload),
  );
}

async function findExistingBookId(
  database: SQLiteDatabase,
  book: ScannedBookInput,
) {
  const normalizedUri = book.uri ? normalizeBookUri(book.uri) : null;

  if (normalizedUri) {
    const location = await database.getFirstAsync<{ book_id: string }>(
      "SELECT book_id FROM book_locations WHERE normalized_uri = ?",
      normalizedUri,
    );

    if (location) {
      return location.book_id;
    }
  }

  if (book.contentFingerprint) {
    const contentMatch = await database.getFirstAsync<{ id: string }>(
      "SELECT id FROM books WHERE content_fingerprint = ?",
      book.contentFingerprint,
    );

    if (contentMatch) {
      return contentMatch.id;
    }
  }

  const metadataFingerprint = createMetadataFingerprint(book);
  const metadataMatch = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM books WHERE metadata_fingerprint = ? ORDER BY updated_at DESC LIMIT 1",
    metadataFingerprint,
  );

  return metadataMatch?.id ?? null;
}

async function replaceBookCollections(
  database: SQLiteDatabase,
  bookId: string,
  book: Book,
) {
  await database.runAsync(
    "DELETE FROM book_contributors WHERE book_id = ?",
    bookId,
  );
  await database.runAsync(
    "DELETE FROM book_subjects WHERE book_id = ?",
    bookId,
  );

  const contributors = book.contributors ?? [];
  for (const [index, name] of contributors.entries()) {
    await database.runAsync(
      "INSERT OR IGNORE INTO book_contributors (book_id, name, role, position) VALUES (?, ?, ?, ?)",
      bookId,
      name,
      "contributor",
      index,
    );
  }

  for (const subject of book.subjects ?? []) {
    await database.runAsync(
      "INSERT OR IGNORE INTO book_subjects (book_id, subject) VALUES (?, ?)",
      bookId,
      subject,
    );
  }

  if (book.isbn) {
    await database.runAsync(
      "INSERT OR IGNORE INTO book_identifiers (book_id, kind, value) VALUES (?, ?, ?)",
      bookId,
      "isbn",
      book.isbn,
    );
  }
}

async function upsertBookLocation(
  database: SQLiteDatabase,
  bookId: string,
  uri: string | undefined,
  origin: BookLocationOrigin,
) {
  if (!uri) {
    return;
  }

  const normalizedUri = normalizeBookUri(uri);
  const existingPrimary = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM book_locations WHERE book_id = ? AND is_primary = 1",
    bookId,
  );
  const isPrimary = existingPrimary ? 0 : 1;

  await database.runAsync(
    `
    INSERT INTO book_locations (
      id, book_id, uri, normalized_uri, origin, is_primary, is_available, last_seen_at, missing_since, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(normalized_uri) DO UPDATE SET
      book_id = excluded.book_id,
      uri = excluded.uri,
      origin = excluded.origin,
      is_available = 1,
      last_seen_at = CURRENT_TIMESTAMP,
      missing_since = NULL,
      updated_at = CURRENT_TIMESTAMP
    `,
    createId("location"),
    bookId,
    uri,
    normalizedUri,
    origin,
    isPrimary,
  );
}

async function upsertOneBook(
  database: SQLiteDatabase,
  book: ScannedBookInput,
  origin: BookLocationOrigin,
) {
  const existingBookId = await findExistingBookId(database, book);
  const bookId = existingBookId ?? createId("book");
  const metadataFingerprint = createMetadataFingerprint(book);
  const duplicateGroupId = createDuplicateGroupId(book);
  const progress = toProgressNumber(book.progress);

  if (existingBookId) {
    await database.runAsync(
      `
      UPDATE books SET
        extension = ?,
        archive = ?,
        status = CASE
          WHEN status IN ('deleted', 'skipped', 'trashed') THEN status
          ELSE 'active'
        END,
        title = ?,
        sort_title = ?,
        author = ?,
        sort_author = ?,
        publisher = ?,
        published_date = ?,
        description = ?,
        language = ?,
        isbn = ?,
        series = ?,
        series_index = ?,
        cover_uri = COALESCE(?, cover_uri),
        content_fingerprint = COALESCE(?, content_fingerprint),
        metadata_fingerprint = ?,
        duplicate_group_id = ?,
        progress = MAX(progress, ?),
        page_count = COALESCE(?, page_count),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      book.extension,
      book.archive ?? null,
      book.title,
      normalizeSearchText(book.title),
      book.author ?? null,
      normalizeSearchText(book.author),
      book.publisher ?? null,
      book.publishedDate ?? null,
      book.description ?? null,
      book.language ?? null,
      book.isbn ?? null,
      book.series ?? null,
      book.seriesIndex ?? null,
      toStoredCoverReference(book.coverBase64),
      book.contentFingerprint ?? null,
      metadataFingerprint,
      duplicateGroupId,
      progress,
      book.pageCount ?? null,
      bookId,
    );
  } else {
    await database.runAsync(
      `
      INSERT INTO books (
        id, extension, archive, title, sort_title, author, sort_author, publisher,
        published_date, description, language, isbn, series, series_index, cover_uri,
        content_fingerprint, metadata_fingerprint, duplicate_group_id, progress, page_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      bookId,
      book.extension,
      book.archive ?? null,
      book.title,
      normalizeSearchText(book.title),
      book.author ?? null,
      normalizeSearchText(book.author),
      book.publisher ?? null,
      book.publishedDate ?? null,
      book.description ?? null,
      book.language ?? null,
      book.isbn ?? null,
      book.series ?? null,
      book.seriesIndex ?? null,
      toStoredCoverReference(book.coverBase64),
      book.contentFingerprint ?? null,
      metadataFingerprint,
      duplicateGroupId,
      progress,
      book.pageCount ?? null,
    );
  }

  await upsertBookLocation(database, bookId, book.uri, origin);
  await upsertBookCoverAsset(database, bookId, book.coverBase64);
  await replaceBookCollections(database, bookId, book);

  return {
    bookId,
    inserted: existingBookId ? 0 : 1,
    updated: existingBookId ? 1 : 0,
  };
}

export async function upsertScannedBooks(
  books: ScannedBookInput[],
): Promise<UpsertLibraryBooksResult> {
  const database = await getLibraryDatabase();
  const result: UpsertLibraryBooksResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    missing: 0,
    activeBookIds: [],
  };
  const seenUris = books
    .map((book) => (book.uri ? normalizeBookUri(book.uri) : null))
    .filter((uri): uri is string => Boolean(uri));

  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const book of books) {
      const upserted = await upsertOneBook(transaction, book, "scan");

      result.inserted += upserted.inserted;
      result.updated += upserted.updated;
      result.activeBookIds.push(upserted.bookId);
    }

    if (seenUris.length > 0) {
      const placeholders = seenUris.map(() => "?").join(", ");
      const missingRow = await transaction.getFirstAsync<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM book_locations
        WHERE origin = 'scan'
          AND is_available = 1
          AND normalized_uri NOT IN (${placeholders})
        `,
        ...seenUris,
      );

      result.missing = missingRow?.count ?? 0;

      await transaction.runAsync(
        `
        UPDATE book_locations
        SET is_available = 0,
            missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE origin = 'scan'
          AND is_available = 1
          AND normalized_uri NOT IN (${placeholders})
        `,
        ...seenUris,
      );
    }

    const skippedRow = await transaction.getFirstAsync<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM books
      WHERE id IN (${result.activeBookIds.map(() => "?").join(", ") || "NULL"})
        AND status = 'skipped'
      `,
      ...result.activeBookIds,
    );

    result.skipped = skippedRow?.count ?? 0;
  });

  return result;
}

export async function upsertImportedBook(book: ScannedBookInput) {
  const database = await getLibraryDatabase();
  let bookId = "";

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const result = await upsertOneBook(transaction, book, "import");

    bookId = result.bookId;
    await writeAction(transaction, "import", bookId, { uri: book.uri });
  });

  return bookId;
}

export async function listLibraryBooks(
  status: LibraryBookRecord["status"] = "active",
  options: ListLibraryBooksOptions = {},
) {
  const database = await getLibraryDatabase();
  const searchWhere = createSearchWhereClause(options.query);
  const rows = await database.getAllAsync<BookRow>(
    `
    SELECT
      books.*,
      primary_location.uri AS primary_uri,
      cover_asset.uri AS cover_asset_uri
    FROM books
    LEFT JOIN book_locations AS primary_location
      ON primary_location.book_id = books.id
      AND primary_location.is_primary = 1
    LEFT JOIN book_assets AS cover_asset
      ON cover_asset.book_id = books.id
      AND cover_asset.kind = 'cover'
    WHERE books.status = ?
    ${searchWhere.sql}
    ORDER BY
      books.is_starred DESC,
      CASE WHEN books.last_opened_at IS NULL THEN 1 ELSE 0 END ASC,
      books.last_opened_at DESC,
      books.sort_title ASC
    `,
    status,
    ...searchWhere.params,
  );

  return rows.map(mapBookRow);
}

export async function getBookRecord(bookId: string) {
  const database = await getLibraryDatabase();
  const row = await database.getFirstAsync<BookRow>(
    `
    SELECT
      books.*,
      primary_location.uri AS primary_uri,
      cover_asset.uri AS cover_asset_uri
    FROM books
    LEFT JOIN book_locations AS primary_location
      ON primary_location.book_id = books.id
      AND primary_location.is_primary = 1
    LEFT JOIN book_assets AS cover_asset
      ON cover_asset.book_id = books.id
      AND cover_asset.kind = 'cover'
    WHERE books.id = ?
    `,
    bookId,
  );

  return row ? mapBookRow(row) : null;
}

export async function findMergeCandidates(bookId: string) {
  const database = await getLibraryDatabase();
  const source = await getBookRecord(bookId);

  if (!source?.duplicateGroupId) {
    return [];
  }

  const rows = await database.getAllAsync<BookRow>(
    `
    SELECT
      books.*,
      primary_location.uri AS primary_uri,
      cover_asset.uri AS cover_asset_uri
    FROM books
    LEFT JOIN book_locations AS primary_location
      ON primary_location.book_id = books.id
      AND primary_location.is_primary = 1
    LEFT JOIN book_assets AS cover_asset
      ON cover_asset.book_id = books.id
      AND cover_asset.kind = 'cover'
    WHERE books.id != ?
      AND books.duplicate_group_id = ?
      AND books.status != 'deleted'
    ORDER BY books.updated_at DESC
    `,
    bookId,
    source.duplicateGroupId,
  );

  return rows.map(mapBookRow);
}

export async function markBookOpened(bookId: string) {
  const database = await getLibraryDatabase();

  await database.runAsync(
    `
    UPDATE books
    SET last_opened_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    bookId,
  );
}

export async function updateBookProgress({
  bookId,
  currentPosition,
  progress,
  pageCount,
}: {
  bookId: string;
  currentPosition?: string | null;
  progress?: number;
  pageCount?: number | null;
}) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `
      UPDATE books
      SET current_position = COALESCE(?, current_position),
          progress = COALESCE(?, progress),
          page_count = COALESCE(?, page_count),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      currentPosition ?? null,
      progress ?? null,
      pageCount ?? null,
      bookId,
    );
    await writeAction(transaction, "progress", bookId, {
      currentPosition,
      progress,
      pageCount,
    });
  });
}

export async function listBookBookmarks(bookId: string) {
  const database = await getLibraryDatabase();
  const rows = await database.getAllAsync<BookBookmarkRow>(
    `
    SELECT *
    FROM book_bookmarks
    WHERE book_id = ?
    ORDER BY page_number ASC, created_at ASC
    `,
    bookId,
  );

  return rows.map(mapBookBookmarkRow);
}

export async function getBookBookmarkForPage(
  bookId: string,
  pageNumber: number,
) {
  const database = await getLibraryDatabase();
  const row = await database.getFirstAsync<BookBookmarkRow>(
    `
    SELECT *
    FROM book_bookmarks
    WHERE book_id = ?
      AND page_number = ?
    `,
    bookId,
    pageNumber,
  );

  return row ? mapBookBookmarkRow(row) : null;
}

export async function setBookPageBookmarked({
  bookId,
  isBookmarked,
  label,
  pageNumber,
  positionPayload,
  rendererKind,
}: {
  bookId: string;
  isBookmarked: boolean;
  label?: string | null;
  pageNumber: number;
  positionPayload: string;
  rendererKind: BookRendererKind;
}) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    if (isBookmarked) {
      await transaction.runAsync(
        `
        INSERT INTO book_bookmarks (
          id,
          book_id,
          renderer_kind,
          page_number,
          position_payload,
          label,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(book_id, page_number) DO UPDATE SET
          renderer_kind = excluded.renderer_kind,
          position_payload = excluded.position_payload,
          label = excluded.label,
          updated_at = CURRENT_TIMESTAMP
        `,
        createId("bookmark"),
        bookId,
        rendererKind,
        pageNumber,
        positionPayload,
        label ?? null,
      );
      await writeAction(transaction, "bookmark", bookId, {
        pageNumber,
        positionPayload,
        rendererKind,
      });
      return;
    }

    await transaction.runAsync(
      "DELETE FROM book_bookmarks WHERE book_id = ? AND page_number = ?",
      bookId,
      pageNumber,
    );
    await writeAction(transaction, "unbookmark", bookId, {
      pageNumber,
      rendererKind,
    });
  });
}

export async function setBookStarred(bookId: string, isStarred: boolean) {
  await starBook(bookId, isStarred);
}

export async function starBook(bookId: string, isStarred = true) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "UPDATE books SET is_starred = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      isStarred ? 1 : 0,
      bookId,
    );
    await writeAction(transaction, isStarred ? "star" : "unstar", bookId);
  });
}

export async function trashBook(bookId: string) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `
      UPDATE books
      SET status = 'trashed',
          trashed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      bookId,
    );
    await writeAction(transaction, "trash", bookId);
  });
}

export async function restoreBook(bookId: string) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `
      UPDATE books
      SET status = 'active',
          trashed_at = NULL,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      bookId,
    );
    await writeAction(transaction, "restore", bookId);
  });
}

export async function skipBook(bookId: string) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "UPDATE books SET status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      bookId,
    );
    await writeAction(transaction, "skip", bookId);
  });
}

export async function deleteBook(bookId: string) {
  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `
      UPDATE books
      SET status = 'deleted',
          deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      bookId,
    );
    await writeAction(transaction, "delete", bookId);
  });
}

export async function mergeBooks(sourceBookId: string, targetBookId: string) {
  if (sourceBookId === targetBookId) {
    return;
  }

  const database = await getLibraryDatabase();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const source = await transaction.getFirstAsync<BookRow>(
      "SELECT * FROM books WHERE id = ?",
      sourceBookId,
    );
    const target = await transaction.getFirstAsync<BookRow>(
      "SELECT * FROM books WHERE id = ?",
      targetBookId,
    );

    if (!source || !target) {
      return;
    }

    await transaction.runAsync(
      `
      UPDATE books SET
        author = COALESCE(author, ?),
        publisher = COALESCE(publisher, ?),
        published_date = COALESCE(published_date, ?),
        description = COALESCE(description, ?),
        language = COALESCE(language, ?),
        isbn = COALESCE(isbn, ?),
        series = COALESCE(series, ?),
        series_index = COALESCE(series_index, ?),
        cover_uri = COALESCE(cover_uri, ?),
        content_fingerprint = COALESCE(content_fingerprint, ?),
        page_count = COALESCE(page_count, ?),
        progress = MAX(progress, ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      source.author,
      source.publisher,
      source.published_date,
      source.description,
      source.language,
      source.isbn,
      source.series,
      source.series_index,
      source.cover_uri,
      source.content_fingerprint,
      source.page_count,
      source.progress,
      targetBookId,
    );
    await transaction.runAsync(
      "UPDATE book_locations SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE book_id = ?",
      targetBookId,
      sourceBookId,
    );
    await transaction.runAsync(
      "UPDATE OR IGNORE book_contributors SET book_id = ? WHERE book_id = ?",
      targetBookId,
      sourceBookId,
    );
    await transaction.runAsync(
      "UPDATE OR IGNORE book_subjects SET book_id = ? WHERE book_id = ?",
      targetBookId,
      sourceBookId,
    );
    await transaction.runAsync(
      "UPDATE OR IGNORE book_identifiers SET book_id = ? WHERE book_id = ?",
      targetBookId,
      sourceBookId,
    );
    await transaction.runAsync(
      "UPDATE OR REPLACE book_assets SET book_id = ?, updated_at = CURRENT_TIMESTAMP WHERE book_id = ?",
      targetBookId,
      sourceBookId,
    );
    await transaction.runAsync("DELETE FROM books WHERE id = ?", sourceBookId);
    await writeAction(transaction, "merge", targetBookId, { sourceBookId });
  });
}
