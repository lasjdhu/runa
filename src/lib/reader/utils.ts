export function clamp(value: number, min: number, max: number) {
  "worklet";

  return Math.min(Math.max(value, min), max);
}

export function pageToRatio(pageNumber: number, pageCount: number) {
  if (pageCount <= 1) {
    return 0;
  }

  return clamp((pageNumber - 1) / (pageCount - 1), 0, 1);
}

export type ReaderZoomState = {
  scale: number;
  translateX: number;
  translateY: number;
};

export function normalizeReaderZoomState(
  value: unknown,
): ReaderZoomState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as {
    scale?: unknown;
    translateX?: unknown;
    translateY?: unknown;
  };
  const scale = Number(candidate.scale);
  const translateX = Number(candidate.translateX);
  const translateY = Number(candidate.translateY);

  if (
    !Number.isFinite(scale) ||
    !Number.isFinite(translateX) ||
    !Number.isFinite(translateY)
  ) {
    return null;
  }

  return {
    scale: Math.max(1, scale),
    translateX,
    translateY,
  };
}

export function getSavedPosition(position: string | null | undefined) {
  if (!position) {
    return { isZoomLocked: false, page: 0, zoomState: null };
  }

  try {
    const parsed = JSON.parse(position) as {
      isZoomLocked?: unknown;
      page?: unknown;
      zoomState?: unknown;
    };
    const page = Number(parsed.page);
    const zoomState = normalizeReaderZoomState(parsed.zoomState);

    return {
      isZoomLocked: Boolean(parsed.isZoomLocked),
      page: Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0,
      zoomState,
    };
  } catch {
    return { isZoomLocked: false, page: 0, zoomState: null };
  }
}

export function isEncryptedPdfError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_RUNA_PDF_ENCRYPTED"
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);

  return /password|encrypted|security|protected/i.test(message);
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);
}

export function isMissingFileError(error: unknown) {
  const message = getErrorMessage(error);

  return /no such file|enoent|not found|file does not exist/i.test(message);
}

export function formatPdfOpenError(error: unknown) {
  if (isMissingFileError(error)) {
    return "The PDF file could not be found. It may have been moved, deleted, or is no longer available to Runa.";
  }

  const message = getErrorMessage(error).trim();

  return message
    ? `Unable to open this PDF. ${message}`
    : "Unable to open this PDF.";
}
