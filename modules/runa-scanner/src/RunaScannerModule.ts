import { NativeModule, requireNativeModule } from "expo";

import type {
  NativeBook,
  NativePdfChapter,
  NativePdfPage,
  NativePdfPageText,
} from "./RunaScanner.types";

declare class RunaScannerModule extends NativeModule<Record<string, never>> {
  extractPdfPageTextAsync(
    source: string,
    page: number,
    password: string | null,
  ): Promise<NativePdfPageText>;
  isAllFilesAccessGrantedAsync(): Promise<boolean>;
  parsePdfChaptersAsync(source: string): Promise<NativePdfChapter[]>;
  renderPdfPageAsync(
    source: string,
    page: number,
    appearance: "day" | "night",
    password: string | null,
    renderScale: number,
  ): Promise<NativePdfPage>;
  scanForBooksAsync(): Promise<NativeBook[]>;
}

export default requireNativeModule<RunaScannerModule>("RunaScanner");
