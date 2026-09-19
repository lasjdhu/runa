export type NativeBook = {
  uri?: string;
  extension: "pdf" | "epub" | "fb2";
  archive?: "zip";
  title: string;
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
  progress: string;
};

export type NativePdfPage = {
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

export type NativePdfChapter = {
  title: string;
  page: number;
};

export type NativePdfPageText = {
  page: number;
  totalPages: number;
  pageWidth: number;
  pageHeight: number;
  text: string;
};
