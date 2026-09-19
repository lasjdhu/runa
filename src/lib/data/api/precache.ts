export function createPagePrecachePlan({
  currentPage,
  loadedPages,
  pageCount,
  radius = 1,
}: {
  currentPage: number;
  loadedPages: Iterable<number>;
  pageCount?: number | null;
  radius?: number;
}) {
  const firstPage = Math.max(0, currentPage - radius);
  const lastPage =
    pageCount == null
      ? currentPage + radius
      : Math.min(pageCount - 1, currentPage + radius);
  const keep = Array.from(
    { length: Math.max(0, lastPage - firstPage + 1) },
    (_, index) => firstPage + index,
  );
  const keepSet = new Set(keep);
  const loaded = Array.from(loadedPages);
  const loadedSet = new Set(loaded);

  return {
    currentPage,
    radius,
    keep,
    render: keep.filter((page) => !loadedSet.has(page)),
    evict: loaded.filter((page) => !keepSet.has(page)),
  };
}
