import type { Book } from "@/lib/types";

export function normalizeBookUri(uri: string) {
  return decodeURIComponent(uri)
    .replace(/^file:\/\/\/sdcard\//i, "file:///storage/emulated/0/")
    .replace(/\/+/g, "/")
    .replace(/^file:\//, "file:///");
}

export function normalizeSearchText(value: string | undefined | null) {
  return (value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createMetadataFingerprint(
  book: Pick<Book, "extension"> & Partial<Book>,
) {
  return [
    book.extension,
    normalizeSearchText(book.isbn),
    normalizeSearchText(book.title),
    normalizeSearchText(book.author),
    normalizeSearchText(book.publisher),
    normalizeSearchText(book.publishedDate),
  ].join("|");
}

export function createDuplicateGroupId(
  book: Pick<Book, "extension"> & Partial<Book>,
) {
  const isbn = normalizeSearchText(book.isbn);

  if (isbn) {
    return `isbn:${isbn}`;
  }

  return [
    "meta",
    book.extension,
    normalizeSearchText(book.title),
    normalizeSearchText(book.author),
  ].join(":");
}
