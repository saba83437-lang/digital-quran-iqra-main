export interface ReportPageResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

export interface ReportPagedLoad<T> {
  data: T[];
  error: string | null;
}

/** دریافت همه ردیف‌ها با Rangeهای پایدار؛ بدون تغییر Pagination ظاهری UI. */
export async function fetchAllReportPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<ReportPageResult<T>>,
  pageSize = 500,
): Promise<ReportPagedLoad<T>> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) {
      return { data: rows, error: result.error.message || "خطای نامشخص دریافت داده" };
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}
