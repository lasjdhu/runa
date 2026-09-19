import * as FileSystem from "expo-file-system/legacy";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";

import type { Book, SupportedBookExtension } from "../types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: () => false,
});

function uint8ToString(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function uint8ToDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${uint8ToBase64(bytes)}`;
}

async function readFileBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToUint8Array(b64);
}

function getFileName(uri: string) {
  const decoded = decodeURIComponent(uri);
  return decoded.split("/").pop()?.split(":").pop() ?? "";
}

function isZipWrappedBook(uri: string, extension: SupportedBookExtension) {
  const fileName = getFileName(uri).toLocaleLowerCase();

  return (
    fileName.endsWith(".zip") ||
    (extension === "fb2" && fileName.endsWith(".fb2z"))
  );
}

function findBookEntry(
  files: Record<string, Uint8Array>,
  extension: SupportedBookExtension,
) {
  const suffix = `.${extension}`;

  return Object.entries(files).find(([path, bytes]) => {
    return bytes.length > 0 && path.toLocaleLowerCase().endsWith(suffix);
  })?.[1];
}

async function readBookBytes(
  uri: string,
  extension: SupportedBookExtension,
): Promise<Uint8Array> {
  const bytes = await readFileBytes(uri);

  if (!isZipWrappedBook(uri, extension)) {
    return bytes;
  }

  const files = unzipSync(bytes);
  const bookBytes = findBookEntry(files, extension);

  return bookBytes ?? bytes;
}

async function writeTempPdf(bytes: Uint8Array) {
  const baseDirectory =
    FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    return null;
  }

  const directory = `${baseDirectory.replace(/\/+$/, "")}/pdf-thumbnails`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const uri = `${directory}/source-${Date.now()}-${Math.round(
    Math.random() * 1_000_000,
  )}.pdf`;

  await FileSystem.writeAsStringAsync(uri, uint8ToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  return uri;
}

function stripXml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (Array.isArray(value))
    return (value as unknown[])
      .map((v) => (typeof v === "string" ? v.trim() : String(v)))
      .filter(Boolean);
  if (typeof value === "object" && value !== null) {
    const asObj = value as Record<string, unknown>;
    const text = asObj["#text"] ?? asObj["_"] ?? "";
    return [String(text).trim()].filter(Boolean);
  }
  return [];
}

function first(value: unknown): string {
  return toStringArray(value)[0] ?? "";
}

interface EpubMeta {
  title?: string;
  author?: string;
  contributors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  language?: string;
  isbn?: string;
  series?: string;
  seriesIndex?: number;
  subjects?: string[];
  coverBase64?: string;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function getEpubItemDataUri(
  item: Record<string, unknown> | undefined,
  allFiles: Record<string, Uint8Array>,
  opfDir: string,
): string | undefined {
  if (!item) {
    return undefined;
  }

  const href = String(item["@_href"] ?? "");
  if (!href) {
    return undefined;
  }

  const mediaType = String(item["@_media-type"] ?? "image/jpeg");
  const coverPath = opfDir ? `${opfDir}/${href}` : href;
  const coverBytes = allFiles[coverPath] ?? allFiles[href];

  return coverBytes ? uint8ToDataUri(coverBytes, mediaType) : undefined;
}

function findEpubCoverItem(
  itemArr: unknown[],
  metaArr: unknown[],
): Record<string, unknown> | undefined {
  const items = itemArr.filter(
    (it): it is Record<string, unknown> =>
      typeof it === "object" && it !== null,
  );

  const explicitCoverId = metaArr
    .map((m) => (typeof m === "object" && m !== null ? m : null))
    .filter((m): m is Record<string, unknown> => Boolean(m))
    .find((m) => String(m["@_name"] ?? "").toLowerCase() === "cover");
  const explicitCoverContent = explicitCoverId
    ? String(explicitCoverId["@_content"] ?? explicitCoverId["#text"] ?? "")
    : "";
  const explicitCoverItem = explicitCoverContent
    ? items.find((item) => String(item["@_id"] ?? "") === explicitCoverContent)
    : undefined;

  if (explicitCoverItem) {
    return explicitCoverItem;
  }

  return items.find((item) => {
    const mediaType = String(item["@_media-type"] ?? "").toLowerCase();
    const properties = String(item["@_properties"] ?? "").toLowerCase();

    return (
      mediaType.startsWith("image/") &&
      properties.split(/\s+/).includes("cover-image")
    );
  });
}

function findBroadEpubCoverItem(
  itemArr: unknown[],
): Record<string, unknown> | undefined {
  return itemArr.find((it) => {
    if (typeof it !== "object" || it === null) {
      return false;
    }

    const obj = it as Record<string, unknown>;
    const mediaType = String(obj["@_media-type"] ?? "").toLowerCase();
    const id = String(obj["@_id"] ?? "").toLowerCase();
    const props = String(obj["@_properties"] ?? "").toLowerCase();
    const href = String(obj["@_href"] ?? "").toLowerCase();

    return (
      mediaType.startsWith("image/") &&
      (id.includes("cover") ||
        props.includes("cover-image") ||
        href.includes("cover"))
    );
  }) as Record<string, unknown> | undefined;
}

function parseEpubOpf(
  opfXml: string,
  allFiles: Record<string, Uint8Array>,
  opfDir: string,
): EpubMeta {
  const doc = xmlParser.parse(opfXml) as Record<string, unknown>;

  const pkg =
    (doc["package"] as Record<string, unknown>) ??
    (doc["opf:package"] as Record<string, unknown>) ??
    doc;

  const metadata =
    ((pkg["metadata"] ?? pkg["opf:metadata"]) as Record<string, unknown>) ?? {};
  const manifest =
    ((pkg["manifest"] ?? pkg["opf:manifest"]) as Record<string, unknown>) ?? {};

  const title = first(metadata["dc:title"] ?? metadata["title"]);

  const creators = toStringArray(
    metadata["dc:creator"] ?? metadata["creator"],
  ).map(stripXml);
  const author = creators[0] ?? "";

  const contributors = toStringArray(
    metadata["dc:contributor"] ?? metadata["contributor"],
  )
    .map(stripXml)
    .filter((c) => c !== author);

  const publisher = first(metadata["dc:publisher"] ?? metadata["publisher"]);
  const publishedDate = first(metadata["dc:date"] ?? metadata["date"]);
  const description = stripXml(
    first(metadata["dc:description"] ?? metadata["description"]),
  );
  const language = first(metadata["dc:language"] ?? metadata["language"]);

  const identifiers = toStringArray(
    metadata["dc:identifier"] ?? metadata["identifier"],
  );
  const isbn = identifiers.find((id) => /isbn/i.test(id));

  let series = "";
  let seriesIndex: number | undefined;
  const metaTags = metadata["meta"];
  const metaArr: unknown[] = Array.isArray(metaTags)
    ? metaTags
    : metaTags
      ? [metaTags]
      : [];
  for (const m of metaArr) {
    if (typeof m !== "object" || m === null) continue;
    const mObj = m as Record<string, unknown>;
    const name = String(mObj["@_name"] ?? "");
    const content = String(mObj["@_content"] ?? mObj["#text"] ?? "");
    if (name === "calibre:series") series = content;
    if (name === "calibre:series_index") seriesIndex = parseFloat(content);
  }

  const subjects = toStringArray(
    metadata["dc:subject"] ?? metadata["subject"],
  ).map(stripXml);

  let coverBase64: string | undefined;
  try {
    const items = (manifest["item"] ?? manifest["opf:item"]) as unknown;
    const itemArr = toArray(items);

    coverBase64 =
      getEpubItemDataUri(
        findEpubCoverItem(itemArr, metaArr),
        allFiles,
        opfDir,
      ) ??
      getEpubItemDataUri(findBroadEpubCoverItem(itemArr), allFiles, opfDir);

    if (!coverBase64) {
      const imageItem = itemArr.find((it) => {
        const obj = it as Record<string, unknown>;
        return String(obj["@_media-type"] ?? "").startsWith("image/");
      }) as Record<string, unknown> | undefined;

      if (imageItem) {
        const href = String(imageItem["@_href"] ?? "");
        const mediaType = String(imageItem["@_media-type"] ?? "image/jpeg");
        const coverPath = opfDir ? `${opfDir}/${href}` : href;
        const coverBytes = allFiles[coverPath] ?? allFiles[href];
        if (coverBytes) coverBase64 = uint8ToDataUri(coverBytes, mediaType);
      }
    }
  } catch {
    // best-effort
  }

  return {
    title,
    author,
    contributors: contributors.length > 0 ? contributors : undefined,
    publisher: publisher || undefined,
    publishedDate: publishedDate || undefined,
    description: description || undefined,
    language: language || undefined,
    isbn: isbn || undefined,
    series: series || undefined,
    seriesIndex,
    subjects: subjects.length > 0 ? subjects : undefined,
    coverBase64,
  };
}

async function extractEpubMetadata(uri: string): Promise<EpubMeta> {
  const bytes = await readBookBytes(uri, "epub");
  const zip = unzipSync(bytes);

  const containerXml =
    zip["META-INF/container.xml"] ?? zip["meta-inf/container.xml"];
  if (!containerXml) return {};

  const container = xmlParser.parse(uint8ToString(containerXml)) as Record<
    string,
    unknown
  >;

  let opfPath = "";
  try {
    const rootfiles =
      ((
        (container["container"] as Record<string, unknown>)?.[
          "rootfiles"
        ] as Record<string, unknown>
      )?.["rootfile"] as Record<string, unknown>) ?? {};
    opfPath = String(
      (rootfiles as Record<string, unknown>)["@_full-path"] ?? "",
    );
  } catch {
    opfPath = Object.keys(zip).find((k) => k.endsWith(".opf")) ?? "";
  }

  if (!opfPath) return {};

  const opfBytes = zip[opfPath];
  if (!opfBytes) return {};

  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/"))
    : "";

  return parseEpubOpf(uint8ToString(opfBytes), zip, opfDir);
}

interface Fb2Meta {
  title?: string;
  author?: string;
  contributors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  language?: string;
  isbn?: string;
  series?: string;
  seriesIndex?: number;
  subjects?: string[];
  coverBase64?: string;
}

async function extractFb2Metadata(uri: string): Promise<Fb2Meta> {
  const xmlText = uint8ToString(await readBookBytes(uri, "fb2"));

  const snippet = xmlText.slice(0, 65536);
  const doc = xmlParser.parse(snippet) as Record<string, unknown>;

  const fb = (doc["FictionBook"] ?? doc["fictionbook"] ?? doc) as Record<
    string,
    unknown
  >;
  const description = (fb["description"] ?? {}) as Record<string, unknown>;
  const titleInfo = (description["title-info"] ??
    description["title_info"] ??
    {}) as Record<string, unknown>;
  const publishInfo = (description["publish-info"] ??
    description["publish_info"] ??
    {}) as Record<string, unknown>;

  const title = stripXml(
    first(titleInfo["book-title"] ?? titleInfo["book_title"] ?? ""),
  );

  const authorRaw = titleInfo["author"];
  const authorArr: unknown[] = Array.isArray(authorRaw)
    ? authorRaw
    : authorRaw
      ? [authorRaw]
      : [];

  function fb2Name(a: unknown): string {
    if (typeof a === "string") return a.trim();
    if (typeof a !== "object" || !a) return "";
    const o = a as Record<string, unknown>;
    const parts = [o["first-name"], o["middle-name"], o["last-name"]]
      .filter(Boolean)
      .map((p) => String(p).trim());
    return parts.join(" ").trim() || String(o["nickname"] ?? "").trim();
  }

  const authors = authorArr.map(fb2Name).filter(Boolean);
  const author = authors[0] ?? "";

  const translatorRaw = titleInfo["translator"];
  const translatorArr: unknown[] = Array.isArray(translatorRaw)
    ? translatorRaw
    : translatorRaw
      ? [translatorRaw]
      : [];
  const contributors = translatorArr.map(fb2Name).filter(Boolean);

  const subjects = toStringArray(titleInfo["genre"]);
  const language = String(titleInfo["lang"] ?? "").trim() || undefined;

  const sequence = titleInfo["sequence"] as Record<string, unknown> | undefined;
  const series = String(sequence?.["@_name"] ?? "").trim() || undefined;
  const seriesIndexRaw = sequence?.["@_number"];
  const seriesIndex = seriesIndexRaw
    ? parseFloat(String(seriesIndexRaw))
    : undefined;

  const publisher = String(publishInfo["publisher"] ?? "").trim() || undefined;
  const publishedDate = String(publishInfo["year"] ?? "").trim() || undefined;
  const isbn = String(publishInfo["isbn"] ?? "").trim() || undefined;

  const annotationRaw = titleInfo["annotation"];
  const description_ = annotationRaw
    ? stripXml(first(annotationRaw))
    : undefined;

  let coverBase64: string | undefined;
  try {
    const coverpageRaw = titleInfo["coverpage"];
    if (coverpageRaw) {
      const imgRaw =
        (coverpageRaw as Record<string, unknown>)["image"] ?? coverpageRaw;
      const href = String(
        (imgRaw as Record<string, unknown>)?.["@_l:href"] ??
          (imgRaw as Record<string, unknown>)?.["@_xlink:href"] ??
          "",
      ).replace(/^#/, "");

      if (href) {
        const idEscaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const binaryRe = new RegExp(
          `<binary[^>]+id=["']${idEscaped}["'][^>]*content-type=["']([^"']+)["'][^>]*>([^<]+)<`,
          "i",
        );
        const altRe = new RegExp(
          `<binary[^>]+content-type=["']([^"']+)["'][^>]+id=["']${idEscaped}["'][^>]*>([^<]+)<`,
          "i",
        );

        const m = binaryRe.exec(xmlText) ?? altRe.exec(xmlText);
        if (m) {
          const mimeType = m[1] ?? "image/jpeg";
          const rawB64 = (m[2] ?? "").replace(/\s+/g, "");
          if (rawB64) coverBase64 = `data:${mimeType};base64,${rawB64}`;
        }
      }
    }

    if (!coverBase64) {
      const anyRe =
        /<binary[^>]+content-type=["'](image\/[^"']+)["'][^>]*>([^<]{100,})</i;
      const m = anyRe.exec(xmlText);
      if (m) {
        const mimeType = m[1] ?? "image/jpeg";
        const rawB64 = (m[2] ?? "").replace(/\s+/g, "");
        if (rawB64) coverBase64 = `data:${mimeType};base64,${rawB64}`;
      }
    }
  } catch {
    // best-effort
  }

  return {
    title: title || undefined,
    author: author || undefined,
    contributors: contributors.length > 0 ? contributors : undefined,
    publisher,
    publishedDate,
    description: description_ || undefined,
    language,
    isbn,
    series,
    seriesIndex,
    subjects: subjects.length > 0 ? subjects : undefined,
    coverBase64,
  };
}

interface PdfMeta {
  title?: string;
  author?: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  language?: string;
  coverBase64?: string;
}

function decodePdfString(raw: string): string {
  const hex = raw.match(/^<([0-9a-f]+)>$/i)?.[1];
  if (hex) {
    if (hex.startsWith("feff") || hex.startsWith("FEFF")) {
      const body = hex.slice(4);
      let out = "";
      for (let i = 0; i < body.length; i += 4) {
        out += String.fromCharCode(parseInt(body.slice(i, i + 4), 16));
      }
      return out;
    }
    let out = "";
    for (let i = 0; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    return out;
  }
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\(.)/g, "$1");
}

async function readPdfMetadataText(uri: string) {
  if (isZipWrappedBook(uri, "pdf")) {
    return uint8ToString(await readBookBytes(uri, "pdf"));
  }

  const info = await FileSystem.getInfoAsync(uri);
  const fileSize =
    info.exists && !info.isDirectory && "size" in info ? info.size : 0;

  const headB64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    length: 65536,
    position: 0,
  });
  const head = uint8ToString(base64ToUint8Array(headB64));

  let trailer = "";
  try {
    const b64tail = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 65536,
      position: Math.max(0, fileSize - 65536),
    });
    trailer = uint8ToString(base64ToUint8Array(b64tail));
  } catch {
    // best-effort
  }

  return head + trailer;
}

async function getPdfCoverSource(uri: string) {
  if (isZipWrappedBook(uri, "pdf")) {
    return (await writeTempPdf(await readBookBytes(uri, "pdf"))) ?? undefined;
  }

  return uri;
}

async function extractPdfMetadata(uri: string): Promise<PdfMeta> {
  const combined = await readPdfMetadataText(uri);

  function extractField(name: string): string {
    const re = new RegExp(
      `\\/${name}\\s*(?:(\\([^)]*(?:\\\\.[^)]*)*\\))|(<[0-9a-fA-F]*>))`,
      "i",
    );
    const m = re.exec(combined);
    if (!m) return "";
    const raw = (m[1] ?? m[2] ?? "").trim();
    const unwrapped = raw.startsWith("(") ? raw.slice(1, -1) : raw;
    return decodePdfString(raw.startsWith("(") ? unwrapped : raw).trim();
  }

  return {
    title: extractField("Title") || undefined,
    author: extractField("Author") || undefined,
    publisher: extractField("Producer") || extractField("Creator") || undefined,
    publishedDate:
      extractField("CreationDate").replace(
        /^D:(\d{4})(\d{2})(\d{2}).*/,
        "$1-$2-$3",
      ) || undefined,
    description: extractField("Subject") || undefined,
    language: extractField("Language") || undefined,
    coverBase64: await getPdfCoverSource(uri),
  };
}

export type BookMetadata = Omit<Book, "extension" | "uri" | "progress">;

export async function extractBookMetadata(
  uri: string,
  extension: SupportedBookExtension,
): Promise<BookMetadata> {
  try {
    switch (extension) {
      case "epub": {
        const m = await extractEpubMetadata(uri);
        return {
          title: m.title ?? "",
          author: m.author,
          contributors: m.contributors,
          publisher: m.publisher,
          publishedDate: m.publishedDate,
          description: m.description,
          language: m.language,
          isbn: m.isbn,
          series: m.series,
          seriesIndex: m.seriesIndex,
          subjects: m.subjects,
          coverBase64: m.coverBase64,
        };
      }
      case "fb2": {
        const m = await extractFb2Metadata(uri);
        return {
          title: m.title ?? "",
          author: m.author,
          contributors: m.contributors,
          publisher: m.publisher,
          publishedDate: m.publishedDate,
          description: m.description,
          language: m.language,
          isbn: m.isbn,
          series: m.series,
          seriesIndex: m.seriesIndex,
          subjects: m.subjects,
          coverBase64: m.coverBase64,
        };
      }
      case "pdf": {
        const m = await extractPdfMetadata(uri);
        return {
          title: m.title ?? "",
          author: m.author,
          publisher: m.publisher,
          publishedDate: m.publishedDate,
          description: m.description,
          language: m.language,
          coverBase64: m.coverBase64,
        };
      }
    }
  } catch {
    return { title: "" };
  }
}
