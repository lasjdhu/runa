import { supportedBookExtensions } from "./config/constants";

export type SupportedBookExtension = (typeof supportedBookExtensions)[number];

export type Book = {
  id?: string;
  uri?: string;
  extension: SupportedBookExtension;
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
  /** Image URI, e.g. a data URI or file URI. */
  coverBase64?: string;
  progress: string;
  isStarred?: boolean;
};
