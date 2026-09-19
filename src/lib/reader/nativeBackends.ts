import RunaScanner, {
  type NativePdfChapter,
  type NativePdfPage,
  type NativePdfPageText,
} from "../../../modules/runa-scanner/src";
import type { ReaderAppearance } from "@/lib/store";

export type ReaderBackendKind = "pdf-native" | "epub-rn" | "fb2-rn";

export async function renderNativePdfPage(
  source: string,
  page: number,
  appearance: ReaderAppearance = "day",
  password: string | null = null,
  renderScale = 1,
): Promise<NativePdfPage> {
  return RunaScanner.renderPdfPageAsync(
    source,
    page,
    appearance,
    password,
    renderScale,
  );
}

export async function parseNativePdfChapters(
  source: string,
): Promise<NativePdfChapter[]> {
  return RunaScanner.parsePdfChaptersAsync(source);
}

export async function extractNativePdfPageText(
  source: string,
  page: number,
  password: string | null = null,
): Promise<NativePdfPageText> {
  return RunaScanner.extractPdfPageTextAsync(source, page, password);
}
