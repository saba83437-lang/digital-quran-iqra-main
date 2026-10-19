import { reportIdKey, type ReportId } from "./report-id.js";

export function createReportLookup<T extends { id: ReportId }>(items: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = reportIdKey(item.id);
    if (key) result.set(key, item);
  }
  return result;
}

export function lookupReportItem<T>(lookup: Map<string, T>, id: ReportId): T | undefined {
  const key = reportIdKey(id);
  return key ? lookup.get(key) : undefined;
}

export function groupReportRows<T>(rows: T[], keySelector: (row: T) => ReportId): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const key = reportIdKey(keySelector(row));
    if (!key) continue;
    const group = result.get(key) ?? [];
    group.push(row);
    result.set(key, group);
  }
  return result;
}
