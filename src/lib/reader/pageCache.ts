import { createPagePrecachePlan } from "@/lib/data/api";

export type PageCacheEntry<TPage> = {
  page: number;
  value: TPage;
};

export type PageLoader<TPage> = (page: number) => Promise<TPage>;

export class PageWindowCache<TPage> {
  private entries = new Map<number, TPage>();

  constructor(
    private readonly loadPage: PageLoader<TPage>,
    private readonly radius = 1,
  ) {}

  get(page: number) {
    return this.entries.get(page) ?? null;
  }

  pages() {
    return Array.from(this.entries.keys());
  }

  async warm(currentPage: number, pageCount?: number | null) {
    const plan = createPagePrecachePlan({
      currentPage,
      loadedPages: this.entries.keys(),
      pageCount,
      radius: this.radius,
    });

    for (const page of plan.evict) {
      this.entries.delete(page);
    }

    const rendered = await Promise.all(
      plan.render.map(async (page) => ({
        page,
        value: await this.loadPage(page),
      })),
    );

    for (const entry of rendered) {
      this.entries.set(entry.page, entry.value);
    }

    return plan;
  }

  clear() {
    this.entries.clear();
  }
}
