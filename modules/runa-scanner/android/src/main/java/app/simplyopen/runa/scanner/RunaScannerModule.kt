package app.simplyopen.runa.scanner

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import io.legere.pdfiumandroid.PdfDocument
import io.legere.pdfiumandroid.PdfPasswordException
import io.legere.pdfiumandroid.PdfiumCore
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.Charset
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

class RunaScannerModule : Module() {
  private val scannerExecutor = Executors.newSingleThreadExecutor()
  private val pdfExecutor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("RunaScanner")

    AsyncFunction("scanForBooksAsync") { promise: Promise ->
      scannerExecutor.execute {
        try {
          promise.resolve(scanForBooks())
        } catch (error: Throwable) {
          promise.reject("ERR_RUNA_SCAN_FAILED", error.message, error)
        }
      }
    }

    AsyncFunction("isAllFilesAccessGrantedAsync") {
      Environment.isExternalStorageManager()
    }

    AsyncFunction("renderPdfPageAsync") { source: String, page: Int, appearance: String?, password: String?, renderScale: Double?, promise: Promise ->
      pdfExecutor.execute {
        try {
          val context = requireNotNull(appContext.reactContext) {
            "Application context is not available"
          }
          val cacheDir = context.cacheDir

          promise.resolve(
            renderPdfPage(
              source,
              page,
              cacheDir,
              appearance ?: "day",
              password,
              renderScale ?: 1.0,
            ),
          )
        } catch (error: Throwable) {
          if (isEncryptedPdfError(error)) {
            promise.reject("ERR_RUNA_PDF_ENCRYPTED", error.message ?: "PDF password required", error)
            return@execute
          }

          promise.reject("ERR_RUNA_PDF_RENDER_FAILED", error.message, error)
        }
      }
    }

    AsyncFunction("extractPdfPageTextAsync") { source: String, page: Int, password: String?, promise: Promise ->
      pdfExecutor.execute {
        try {
          val context = requireNotNull(appContext.reactContext) {
            "Application context is not available"
          }

          promise.resolve(extractPdfPageText(context, source, page, password))
        } catch (error: Throwable) {
          if (isEncryptedPdfError(error)) {
            promise.reject("ERR_RUNA_PDF_ENCRYPTED", error.message ?: "PDF password required", error)
            return@execute
          }

          promise.reject("ERR_RUNA_PDF_TEXT_FAILED", error.message, error)
        }
      }
    }

    AsyncFunction("parsePdfChaptersAsync") { source: String, promise: Promise ->
      pdfExecutor.execute {
        try {
          promise.resolve(parsePdfChapters(source))
        } catch (error: Throwable) {
          promise.reject("ERR_RUNA_PDF_CHAPTERS_FAILED", error.message, error)
        }
      }
    }
  }
}

private const val maxScanDepth = 8
private const val importDirectoryName = "books"
private val supportedExtensions = setOf("pdf", "epub", "fb2")
private val skippedDirectoryNames = setOf("Android", ".Trash", ".thumbnails")

private data class BookFileInfo(
  val extension: String,
  val archive: String? = null,
)

private data class BookMetadata(
  val title: String? = null,
  val author: String? = null,
  val contributors: List<String>? = null,
  val publisher: String? = null,
  val publishedDate: String? = null,
  val description: String? = null,
  val language: String? = null,
  val isbn: String? = null,
  val series: String? = null,
  val seriesIndex: Double? = null,
  val subjects: List<String>? = null,
  val coverBase64: String? = null,
)

private data class EpubManifestItem(
  val id: String,
  val href: String,
  val mediaType: String,
  val properties: String,
)

private data class PdfChapter(
  val title: String,
  val page: Int,
)

private fun renderPdfPage(
  source: String,
  requestedPage: Int,
  rootCacheDir: File,
  appearance: String,
  password: String?,
  renderScale: Double,
): Map<String, Any> {
  return renderPdfPageWithPdfium(
    source,
    requestedPage,
    rootCacheDir,
    appearance,
    password,
    renderScale,
  )
}

private fun renderPdfPageWithPdfium(
  source: String,
  requestedPage: Int,
  rootCacheDir: File,
  appearance: String,
  password: String?,
  renderScale: Double,
): Map<String, Any> {
  val file = fileFromUri(source)
  val cacheDirectory = File(rootCacheDir, "runa-pdf-pages").apply {
    mkdirs()
  }
  val safeRenderScale = renderScale.toFloat().coerceIn(1f, 4f)
  val maxSide = 4096

  ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
    PdfiumCore().newDocument(descriptor, password?.takeIf { it.isNotEmpty() }).use { document ->
      val totalPages = document.getPageCount()

      require(totalPages > 0) { "PDF has no pages" }

      val pageIndex = requestedPage.coerceIn(0, totalPages - 1)

      document.openPage(pageIndex).use { pdfPage ->
        requireNotNull(pdfPage) { "Unable to open PDF page" }

        val pageWidth = pdfPage.getPageWidthPoint().coerceAtLeast(1)
        val pageHeight = pdfPage.getPageHeightPoint().coerceAtLeast(1)
        val baseScale = minOf(
          1800f / pageWidth.toFloat(),
          1800f / pageHeight.toFloat(),
          3f,
        ).coerceAtLeast(1f)
        val bitmapScale = minOf(
          baseScale * safeRenderScale,
          maxSide.toFloat() / pageWidth.toFloat(),
          maxSide.toFloat() / pageHeight.toFloat(),
        ).coerceAtLeast(1f)
        val width = (pageWidth * bitmapScale).toInt().coerceAtLeast(1)
        val height = (pageHeight * bitmapScale).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        bitmap.eraseColor(Color.WHITE)
        pdfPage.renderPageBitmap(
          bitmap,
          0,
          0,
          width,
          height,
          renderAnnot = true,
          canvasColor = Color.WHITE,
          pageBackgroundColor = Color.WHITE,
        )
        applyPdfAppearance(bitmap, appearance)

        return writeRenderedPdfPage(
          bitmap,
          file,
          pageIndex,
          totalPages,
          cacheDirectory,
          pageWidth,
          pageHeight,
          safeRenderScale,
        )
      }
    }
  }
}

private fun writeRenderedPdfPage(
  bitmap: Bitmap,
  file: File,
  pageIndex: Int,
  totalPages: Int,
  cacheDirectory: File,
  pageWidth: Int,
  pageHeight: Int,
  renderScale: Float,
): Map<String, Any> {
  val backgroundColor = colorToHex(bitmap.getPixel(0, 0))
  val outputFile = File(
    cacheDirectory,
    "${file.nameWithoutExtension}-${pageIndex}-${String.format(Locale.ROOT, "%.2f", renderScale)}-${UUID.randomUUID()}.png",
  )

  FileOutputStream(outputFile).use { output ->
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
  }

  val result = mapOf(
    "uri" to Uri.fromFile(outputFile).toString(),
    "page" to pageIndex,
    "totalPages" to totalPages,
    "width" to bitmap.width,
    "height" to bitmap.height,
    "pageWidth" to pageWidth,
    "pageHeight" to pageHeight,
    "renderScale" to renderScale.toDouble(),
    "backgroundColor" to backgroundColor,
  )

  bitmap.recycle()

  return result
}

private fun applyPdfAppearance(bitmap: Bitmap, appearance: String) {
  if (appearance != "night") {
    return
  }

  val width = bitmap.width
  val height = bitmap.height
  val pixels = IntArray(width * height)

  bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

  for (index in pixels.indices) {
    val color = pixels[index]
    val alpha = Color.alpha(color)
    val red = 255 - Color.red(color)
    val green = 255 - Color.green(color)
    val blue = 255 - Color.blue(color)

    pixels[index] = Color.argb(alpha, red, green, blue)
  }

  bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
}

private fun isEncryptedPdfError(error: Throwable): Boolean {
  if (error is PdfPasswordException || error is SecurityException) {
    return true
  }

  val message = error.message ?: return false

  return message.contains("password", ignoreCase = true) ||
    message.contains("encrypted", ignoreCase = true) ||
    message.contains("security", ignoreCase = true)
}

private fun colorToHex(color: Int): String {
  return String.format("#%06X", 0xFFFFFF and color)
}

private fun extractPdfPageText(
  context: android.content.Context,
  source: String,
  requestedPage: Int,
  password: String?,
): Map<String, Any> {
  val file = fileFromUri(source)

  ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
    PdfiumCore(context).newDocument(descriptor, password?.takeIf { it.isNotEmpty() }).use { document ->
      val totalPages = document.getPageCount()

      require(totalPages > 0) { "PDF has no pages" }

      val pageIndex = requestedPage.coerceIn(0, totalPages - 1)

      document.openPage(pageIndex).use { pdfPage ->
        requireNotNull(pdfPage) { "Unable to open PDF page" }

        val pageWidth = pdfPage.getPageWidthPoint().coerceAtLeast(1)
        val pageHeight = pdfPage.getPageHeightPoint().coerceAtLeast(1)

        pdfPage.openTextPage().use { textPage ->
          val charCount = textPage.textPageCountChars().coerceAtLeast(0)
          val text = if (charCount > 0) {
            textPage.textPageGetText(0, charCount).orEmpty()
          } else {
            ""
          }

          return mapOf(
            "page" to pageIndex,
            "totalPages" to totalPages,
            "pageWidth" to pageWidth,
            "pageHeight" to pageHeight,
            "text" to text,
          )
        }
      }
    }
  }
}

private fun parsePdfChapters(source: String): List<Map<String, Any>> {
  val file = fileFromUri(source)
  val chapters = mutableListOf<PdfChapter>()

  ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
    PdfiumCore().newDocument(descriptor).use { document ->
      document.getTableOfContents().forEach { bookmark ->
        collectPdfBookmarks(bookmark, chapters)
      }
    }
  }

  return chapters
    .distinctBy { "${it.page}:${it.title}" }
    .sortedWith(compareBy<PdfChapter> { it.page }.thenBy { it.title })
    .map { chapter ->
      mapOf(
        "title" to chapter.title,
        "page" to chapter.page,
      )
    }
}

private fun collectPdfBookmarks(
  bookmark: PdfDocument.Bookmark,
  chapters: MutableList<PdfChapter>,
) {
  val title = bookmark.title?.trim().orEmpty()
  val page = bookmark.pageIdx.toInt()

  if (title.isNotEmpty() && page >= 0) {
    chapters.add(PdfChapter(title, page))
  }

  bookmark.children.forEach { child ->
    collectPdfBookmarks(child, chapters)
  }
}

private fun fileFromUri(source: String): File {
  val uri = Uri.parse(source)

  if (uri.scheme == "file") {
    return File(requireNotNull(uri.path) { "Invalid file URI" })
  }

  return File(source)
}

private fun scanForBooks(): List<Map<String, Any?>> {
  val found = mutableListOf<Map<String, Any?>>()
  val visited = mutableSetOf<String>()
  val roots = buildList {
    add(File(Environment.getExternalStorageDirectory(), "Books"))
    add(File(Environment.getExternalStorageDirectory(), "Documents"))
    add(File(Environment.getExternalStorageDirectory(), "Download"))
    add(File(Environment.getExternalStorageDirectory(), "Downloads"))
    add(File(Environment.getExternalStorageDirectory(), "Telegram"))
    add(File(Environment.getExternalStorageDirectory(), "WhatsApp"))
  }

  roots.forEach { root ->
    scanDirectory(root, found, visited)
  }

  return found.distinctBy { book ->
    (book["uri"] as? String ?: "${book["title"]}:${book["extension"]}")
      .lowercase(Locale.ROOT)
      .replace("file:///sdcard/", "file:///storage/emulated/0/")
  }
}

private fun scanDirectory(
  directory: File,
  found: MutableList<Map<String, Any?>>,
  visited: MutableSet<String>,
  depth: Int = 0,
) {
  if (depth > maxScanDepth || !directory.exists() || !directory.isDirectory) {
    return
  }

  val canonicalPath = runCatching { directory.canonicalPath }.getOrElse { directory.absolutePath }
  if (!visited.add(canonicalPath) || skippedDirectoryNames.contains(directory.name)) {
    return
  }

  val entries = directory.listFiles() ?: return

  entries.forEach { entry ->
    try {
      if (entry.isDirectory) {
        scanDirectory(entry, found, visited, depth + 1)
        return@forEach
      }

      val info = getBookFileInfo(entry) ?: return@forEach
      val uri = Uri.fromFile(entry).toString()
      val titleFromName = entry.name.replace(
        Regex("\\.(fb2|epub|pdf)(\\.zip)?$|\\.fb2z$|\\.zip$", RegexOption.IGNORE_CASE),
        "",
      )
      val metadata = extractMetadata(entry, info)
      val displayTitle = if (info.extension == "pdf") {
        titleFromName
      } else {
        metadata.title?.ifBlank { null } ?: titleFromName
      }

      found.add(
        buildMap {
          put("uri", uri)
          put("extension", info.extension)
          info.archive?.let { put("archive", it) }
          put("title", displayTitle)
          metadata.author?.let { put("author", it) }
          metadata.contributors?.takeIf { it.isNotEmpty() }?.let { put("contributors", it) }
          metadata.publisher?.let { put("publisher", it) }
          metadata.publishedDate?.let { put("publishedDate", it) }
          metadata.description?.let { put("description", it) }
          metadata.language?.let { put("language", it) }
          metadata.isbn?.let { put("isbn", it) }
          metadata.series?.let { put("series", it) }
          metadata.seriesIndex?.let { put("seriesIndex", it) }
          metadata.subjects?.takeIf { it.isNotEmpty() }?.let { put("subjects", it) }
          metadata.coverBase64?.let { put("coverBase64", it) }
          put("progress", "0%")
        },
      )
    } catch (_: Throwable) {
      // Ignore unreadable or malformed files.
    }
  }
}

private fun getBookFileInfo(file: File): BookFileInfo? {
  val name = file.name.lowercase(Locale.ROOT)

  supportedExtensions.forEach { extension ->
    if (name.endsWith(".$extension")) {
      return BookFileInfo(extension)
    }

    if (name.endsWith(".$extension.zip")) {
      return BookFileInfo(extension, "zip")
    }
  }

  if (name.endsWith(".fb2z")) {
    return BookFileInfo("fb2", "zip")
  }

  if (name.endsWith(".zip")) {
    val entries = readZipEntries(file)
    supportedExtensions.forEach { extension ->
      if (entries.any { it.first.lowercase(Locale.ROOT).endsWith(".$extension") }) {
        return BookFileInfo(extension, "zip")
      }
    }
  }

  return null
}

private fun extractMetadata(file: File, info: BookFileInfo): BookMetadata {
  return runCatching {
    when (info.extension) {
      "epub" -> extractEpubMetadata(file)
      "fb2" -> extractFb2Metadata(file)
      "pdf" -> extractPdfMetadata(file, info)
      else -> BookMetadata()
    }
  }.getOrElse { BookMetadata() }
}

private fun extractEpubMetadata(file: File): BookMetadata {
  val entries = readZipEntries(file).toMap()
  val containerXml = entries["META-INF/container.xml"]?.toStringUtf8()
  val opfPath = containerXml
    ?.let { Regex("full-path=[\"']([^\"']+)[\"']").find(it)?.groupValues?.getOrNull(1) }
    ?: entries.keys.firstOrNull { it.lowercase(Locale.ROOT).endsWith(".opf") }
    ?: return BookMetadata()
  val opfXml = entries[opfPath]?.toStringUtf8() ?: return BookMetadata()
  val opfDir = opfPath.substringBeforeLast("/", "")
  val doc = parseXml(opfXml) ?: return BookMetadata()

  val title = textByTag(doc, "title")
  val creators = textsByTag(doc, "creator")
  val author = creators.firstOrNull()
  val subjects = textsByTag(doc, "subject")
  val identifiers = textsByTag(doc, "identifier")
  val isbn = identifiers.firstOrNull { it.contains("isbn", ignoreCase = true) }
  val publisher = textByTag(doc, "publisher")
  val publishedDate = textByTag(doc, "date")
  val description = textByTag(doc, "description")?.stripXml()
  val language = textByTag(doc, "language")
  var series: String? = null
  var seriesIndex: Double? = null
  var coverBase64: String? = null

  val metas = doc.getElementsByTagName("*")
  for (index in 0 until metas.length) {
    val node = metas.item(index)
    val attrs = node.attributes ?: continue
    val name = attrs.getNamedItem("name")?.nodeValue ?: attrs.getNamedItem("property")?.nodeValue ?: ""
    val content = attrs.getNamedItem("content")?.nodeValue ?: node.textContent ?: ""
    when (name.lowercase(Locale.ROOT)) {
      "calibre:series" -> series = content.ifBlank { null }
      "calibre:series_index" -> seriesIndex = content.toDoubleOrNull()
    }
  }

  val manifestItems = getEpubManifestItems(doc)
  coverBase64 = getStrictEpubCoverItem(doc, manifestItems)
    ?.toCoverDataUri(entries, opfDir)
    ?: getBroadEpubCoverItem(manifestItems)?.toCoverDataUri(entries, opfDir)

  if (coverBase64 == null) {
    val imageEntry = entries.entries.firstOrNull { (path, _) ->
      val lower = path.lowercase(Locale.ROOT)
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")
    }
    if (imageEntry != null) {
      coverBase64 = imageEntry.value.toDataUri(mimeTypeForPath(imageEntry.key))
    }
  }

  return BookMetadata(
    title = title,
    author = author,
    contributors = creators.drop(1).ifEmpty { null },
    publisher = publisher,
    publishedDate = publishedDate,
    description = description,
    language = language,
    isbn = isbn,
    series = series,
    seriesIndex = seriesIndex,
    subjects = subjects.ifEmpty { null },
    coverBase64 = coverBase64,
  )
}

private fun extractFb2Metadata(file: File): BookMetadata {
  val xml = if (file.name.lowercase(Locale.ROOT).endsWith(".fb2z") || file.name.lowercase(Locale.ROOT).endsWith(".zip")) {
    val entry = readZipEntries(file).firstOrNull { it.first.lowercase(Locale.ROOT).endsWith(".fb2") }
    entry?.second?.toStringUtf8()
  } else {
    file.readText()
  } ?: return BookMetadata()

  val doc = parseXml(xml) ?: return BookMetadata()
  val title = textByTag(doc, "book-title")
  val authors = doc.getElementsByTagName("author")
  val authorNames = mutableListOf<String>()
  for (index in 0 until authors.length) {
    val author = authors.item(index)
    val parts = listOf("first-name", "middle-name", "last-name").mapNotNull { tag ->
      author.childNodes.findText(tag)
    }
    parts.joinToString(" ").trim().takeIf { it.isNotBlank() }?.let { authorNames.add(it) }
  }
  val subjects = textsByTag(doc, "genre")
  val language = textByTag(doc, "lang")
  val publisher = textByTag(doc, "publisher")
  val publishedDate = textByTag(doc, "date")
  val description = textByTag(doc, "annotation")?.stripXml()
  val isbn = textByTag(doc, "isbn")
  var coverBase64: String? = null

  val binaries = doc.getElementsByTagName("binary")
  val binaryById = mutableMapOf<String, org.w3c.dom.Node>()
  for (index in 0 until binaries.length) {
    val node = binaries.item(index)
    val id = node.attributes?.getNamedItem("id")?.nodeValue
      ?: node.attributes?.getNamedItem("xml:id")?.nodeValue
    id?.trim()?.trimStart('#')?.takeIf { it.isNotBlank() }?.let {
      binaryById[it] = node
    }
  }

  val coverIds = mutableListOf<String>()
  val coverPages = doc.getElementsByTagName("coverpage")
  for (index in 0 until coverPages.length) {
    val coverPage = coverPages.item(index)
    val children = coverPage.childNodes
    for (childIndex in 0 until children.length) {
      val child = children.item(childIndex)
      val name = child.nodeName.substringAfter(":")
      if (name == "image") {
        val href = child.attributes?.getNamedItem("l:href")?.nodeValue
          ?: child.attributes?.getNamedItem("xlink:href")?.nodeValue
          ?: child.attributes?.getNamedItem("href")?.nodeValue
        href?.trim()?.trimStart('#')?.takeIf { it.isNotBlank() }?.let { coverIds.add(it) }
      }
    }
  }

  val coverNode = coverIds.firstNotNullOfOrNull { binaryById[it] }
    ?: if (binaries.length > 0) binaries.item(0) else null

  if (coverNode != null) {
    val node = coverNode
    val contentType = node.attributes?.getNamedItem("content-type")?.nodeValue ?: "image/jpeg"
    val raw = node.textContent?.replace(Regex("\\s+"), "")
    if (!raw.isNullOrBlank()) {
      coverBase64 = "data:$contentType;base64,$raw"
    }
  }

  return BookMetadata(
    title = title,
    author = authorNames.firstOrNull(),
    contributors = authorNames.drop(1).ifEmpty { null },
    publisher = publisher,
    publishedDate = publishedDate,
    description = description,
    language = language,
    isbn = isbn,
    subjects = subjects.ifEmpty { null },
    coverBase64 = coverBase64,
  )
}

private fun extractPdfMetadata(file: File, info: BookFileInfo): BookMetadata {
  val bytes = if (info.archive == "zip") {
    readZipEntries(file).firstOrNull { it.first.lowercase(Locale.ROOT).endsWith(".pdf") }?.second
  } else {
    file.readBytes()
  } ?: return BookMetadata()

  val combined = buildString {
    append(bytes.copyOfRange(0, minOf(bytes.size, 65536)).toPdfString())
    if (bytes.size > 65536) {
      append(bytes.copyOfRange(maxOf(0, bytes.size - 65536), bytes.size).toPdfString())
    }
  }

  return BookMetadata(
    title = extractPdfField(combined, "Title"),
    author = extractPdfField(combined, "Author"),
    publisher = extractPdfField(combined, "Producer") ?: extractPdfField(combined, "Creator"),
    publishedDate = extractPdfField(combined, "CreationDate")?.replace(
      Regex("^D:(\\d{4})(\\d{2})(\\d{2}).*"),
      "$1-$2-$3",
    ),
    description = extractPdfField(combined, "Subject"),
    language = extractPdfField(combined, "Language"),
    coverBase64 = if (info.archive == "zip") writeTempPdf(file, bytes) else Uri.fromFile(file).toString(),
  )
}

private fun readZipEntries(file: File): List<Pair<String, ByteArray>> {
  val entries = mutableListOf<Pair<String, ByteArray>>()
  ZipInputStream(file.inputStream().buffered()).use { zip ->
    while (true) {
      val entry = zip.nextEntry ?: break
      if (!entry.isDirectory) {
        entries.add(entry.name to zip.readBytes())
      }
      zip.closeEntry()
    }
  }
  return entries
}

private fun parseXml(xml: String) = runCatching {
  DocumentBuilderFactory.newInstance().apply {
    isNamespaceAware = false
  }.newDocumentBuilder().parse(ByteArrayInputStream(xml.toByteArray(Charsets.UTF_8)))
}.getOrNull()

private fun org.w3c.dom.Node.localNameCompat(): String {
  return nodeName.substringAfter(":")
}

private fun getEpubManifestItems(doc: org.w3c.dom.Document): List<EpubManifestItem> {
  val nodes = doc.getElementsByTagName("*")

  return buildList {
    for (index in 0 until nodes.length) {
      val node = nodes.item(index)
      if (node.localNameCompat() != "item") continue

      val attrs = node.attributes ?: continue
      val href = attrs.getNamedItem("href")?.nodeValue ?: continue

      add(
        EpubManifestItem(
          id = attrs.getNamedItem("id")?.nodeValue ?: "",
          href = href,
          mediaType = attrs.getNamedItem("media-type")?.nodeValue ?: "image/jpeg",
          properties = attrs.getNamedItem("properties")?.nodeValue ?: "",
        ),
      )
    }
  }
}

private fun getExplicitEpubCoverId(doc: org.w3c.dom.Document): String? {
  val nodes = doc.getElementsByTagName("*")

  for (index in 0 until nodes.length) {
    val node = nodes.item(index)
    if (node.localNameCompat() != "meta") continue

    val attrs = node.attributes ?: continue
    val name = attrs.getNamedItem("name")?.nodeValue ?: continue
    if (!name.equals("cover", ignoreCase = true)) continue

    return attrs.getNamedItem("content")?.nodeValue
      ?.trim()
      ?.takeIf { it.isNotBlank() }
  }

  return null
}

private fun getStrictEpubCoverItem(
  doc: org.w3c.dom.Document,
  manifestItems: List<EpubManifestItem>,
): EpubManifestItem? {
  val explicitCoverId = getExplicitEpubCoverId(doc)
  if (explicitCoverId != null) {
    manifestItems.firstOrNull { it.id == explicitCoverId }?.let { return it }
  }

  return manifestItems.firstOrNull { item ->
    item.mediaType.startsWith("image/", ignoreCase = true) &&
      item.properties
        .lowercase(Locale.ROOT)
        .split(Regex("\\s+"))
        .contains("cover-image")
  }
}

private fun getBroadEpubCoverItem(
  manifestItems: List<EpubManifestItem>,
): EpubManifestItem? {
  return manifestItems.firstOrNull { item ->
    item.mediaType.startsWith("image/", ignoreCase = true) &&
      (item.id.contains("cover", ignoreCase = true) ||
        item.properties.contains("cover-image", ignoreCase = true) ||
        item.href.contains("cover", ignoreCase = true))
  }
}

private fun EpubManifestItem.toCoverDataUri(
  entries: Map<String, ByteArray>,
  opfDir: String,
): String? {
  val path = if (opfDir.isBlank()) href else "$opfDir/$href"
  val bytes = entries[path] ?: entries[href] ?: return null

  return bytes.toDataUri(mediaType)
}

private fun textByTag(doc: org.w3c.dom.Document, tag: String): String? {
  return textsByTag(doc, tag).firstOrNull()
}

private fun textsByTag(doc: org.w3c.dom.Document, tag: String): List<String> {
  val nodes = doc.getElementsByTagName(tag)
  val namespaced = doc.getElementsByTagName("dc:$tag")
  return buildList {
    for (index in 0 until nodes.length) {
      nodes.item(index).textContent?.trim()?.takeIf { it.isNotBlank() }?.let { add(it) }
    }
    for (index in 0 until namespaced.length) {
      namespaced.item(index).textContent?.trim()?.takeIf { it.isNotBlank() }?.let { add(it) }
    }
  }.distinct()
}

private fun org.w3c.dom.NodeList.findText(tag: String): String? {
  for (index in 0 until length) {
    val node = item(index)
    if (node.nodeName == tag || node.nodeName.endsWith(":$tag")) {
      return node.textContent?.trim()?.takeIf { it.isNotBlank() }
    }
  }
  return null
}

private fun extractPdfField(text: String, name: String): String? {
  val match = Regex("/$name\\s*(?:\\(([^)]*(?:\\\\.[^)]*)*)\\)|<([0-9a-fA-F]*)>)").find(text)
    ?: return null
  val raw = match.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() }
    ?: match.groupValues.getOrNull(2)?.takeIf { it.isNotEmpty() }
    ?: return null
  return decodePdfString(raw).trim().takeIf { it.isNotBlank() }
}

private fun decodePdfString(raw: String): String {
  val hex = raw.takeIf { it.matches(Regex("^[0-9a-fA-F]+$")) }
  if (hex != null) {
    if (hex.startsWith("feff", ignoreCase = true)) {
      return hex.drop(4).chunked(4).mapNotNull { it.toIntOrNull(16)?.toChar() }.joinToString("")
    }
    return hex.chunked(2).mapNotNull { it.toIntOrNull(16)?.toChar() }.joinToString("")
  }

  return raw
    .replace("\\n", "\n")
    .replace("\\r", "\r")
    .replace("\\t", "\t")
    .replace(Regex("\\\\(.)"), "$1")
}

private fun writeTempPdf(source: File, bytes: ByteArray): String? {
  return runCatching {
    val directory = File(source.parentFile ?: Environment.getExternalStorageDirectory(), importDirectoryName)
    directory.mkdirs()
    val out = File.createTempFile("source-", ".pdf", directory)
    out.writeBytes(bytes)
    Uri.fromFile(out).toString()
  }.getOrNull()
}

private fun ByteArray.toStringUtf8(): String = toString(Charsets.UTF_8)

private fun ByteArray.toPdfString(): String = toString(Charset.forName("ISO-8859-1"))

private fun ByteArray.toDataUri(mimeType: String): String {
  return "data:$mimeType;base64,${Base64.encodeToString(this, Base64.NO_WRAP)}"
}

private fun String.stripXml(): String {
  return replace(Regex("<[^>]*>"), "")
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&apos;", "'")
    .trim()
}

private fun mimeTypeForPath(path: String): String {
  val lower = path.lowercase(Locale.ROOT)
  return when {
    lower.endsWith(".png") -> "image/png"
    lower.endsWith(".webp") -> "image/webp"
    else -> "image/jpeg"
  }
}
