export function storageObjectPath(
  bucket: string,
  reference?: string | null,
): string | null {
  const value = String(reference ?? "").trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");

  try {
    const url = new URL(value);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/${bucket}/`,
    ];
    const marker = markers.find((candidate) => url.pathname.includes(candidate));
    if (!marker) return null;
    return decodeURIComponent(url.pathname.split(marker)[1] ?? "").replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}
