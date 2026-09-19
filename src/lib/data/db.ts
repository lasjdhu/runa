import * as SQLite from "expo-sqlite";

export const libraryDatabaseName = "runa-library.db";
const databaseVersion = 3;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getLibraryDatabase() {
  databasePromise ??= SQLite.openDatabaseAsync(libraryDatabaseName).then(
    async (database) => {
      await migrateLibraryDatabase(database);

      return database;
    },
  );

  return databasePromise;
}

export async function initializeLibraryDatabase() {
  await getLibraryDatabase();
}

async function migrateLibraryDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const versionRow = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= databaseVersion) {
    return;
  }

  if (currentVersion === 0) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY NOT NULL,
        extension TEXT NOT NULL CHECK (extension IN ('pdf', 'epub', 'fb2')),
        archive TEXT CHECK (archive IS NULL OR archive = 'zip'),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trashed', 'skipped', 'deleted')),
        title TEXT NOT NULL,
        sort_title TEXT NOT NULL,
        author TEXT,
        sort_author TEXT,
        publisher TEXT,
        published_date TEXT,
        description TEXT,
        language TEXT,
        isbn TEXT,
        series TEXT,
        series_index REAL,
        cover_uri TEXT,
        content_fingerprint TEXT,
        metadata_fingerprint TEXT NOT NULL,
        duplicate_group_id TEXT,
        is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
        current_position TEXT,
        progress REAL NOT NULL DEFAULT 0,
        page_count INTEGER,
        last_opened_at TEXT,
        trashed_at TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS books_content_fingerprint_unique
        ON books(content_fingerprint)
        WHERE content_fingerprint IS NOT NULL;
      CREATE INDEX IF NOT EXISTS books_library_status_index
        ON books(status, is_starred DESC, sort_title);
      CREATE INDEX IF NOT EXISTS books_duplicate_group_index
        ON books(duplicate_group_id)
        WHERE duplicate_group_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS book_locations (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        uri TEXT NOT NULL,
        normalized_uri TEXT NOT NULL UNIQUE,
        origin TEXT NOT NULL CHECK (origin IN ('scan', 'import', 'manual')),
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
        first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        missing_since TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS book_locations_primary_unique
        ON book_locations(book_id)
        WHERE is_primary = 1;
      CREATE INDEX IF NOT EXISTS book_locations_book_index
        ON book_locations(book_id, is_available DESC, is_primary DESC);

      CREATE TABLE IF NOT EXISTS book_contributors (
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'contributor',
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (book_id, name, role)
      );

      CREATE TABLE IF NOT EXISTS book_subjects (
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        PRIMARY KEY (book_id, subject)
      );

      CREATE TABLE IF NOT EXISTS book_identifiers (
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (book_id, kind, value)
      );

      CREATE INDEX IF NOT EXISTS book_identifiers_lookup_index
        ON book_identifiers(kind, value);

      CREATE TABLE IF NOT EXISTS book_assets (
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        uri TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'metadata',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (book_id, kind)
      );

      CREATE TABLE IF NOT EXISTS book_reading_state (
        book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        renderer_kind TEXT NOT NULL CHECK (renderer_kind IN ('pdf-native', 'epub-rn', 'fb2-rn')),
        theme_name TEXT,
        font_family TEXT,
        font_scale REAL,
        page_turn_animation TEXT,
        position_payload TEXT,
        preload_radius INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS book_bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        renderer_kind TEXT NOT NULL CHECK (renderer_kind IN ('pdf-native', 'epub-rn', 'fb2-rn')),
        page_number INTEGER NOT NULL,
        position_payload TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS book_bookmarks_book_page_unique
        ON book_bookmarks(book_id, page_number);
      CREATE INDEX IF NOT EXISTS book_bookmarks_book_index
        ON book_bookmarks(book_id, page_number);

      CREATE TABLE IF NOT EXISTS book_actions (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    currentVersion = 1;
  }

  if (currentVersion === 1) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS book_assets (
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        uri TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'metadata',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (book_id, kind)
      );
    `);

    currentVersion = 2;
  }

  if (currentVersion === 2) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS book_bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        renderer_kind TEXT NOT NULL CHECK (renderer_kind IN ('pdf-native', 'epub-rn', 'fb2-rn')),
        page_number INTEGER NOT NULL,
        position_payload TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS book_bookmarks_book_page_unique
        ON book_bookmarks(book_id, page_number);
      CREATE INDEX IF NOT EXISTS book_bookmarks_book_index
        ON book_bookmarks(book_id, page_number);
    `);

    currentVersion = 3;
  }

  await database.execAsync(`PRAGMA user_version = ${currentVersion}`);
}
