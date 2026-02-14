/** Get value by dot-path with numeric indexes. Returns undefined if not found. */
export function deepGet(obj: any, path: string): any {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    const idx = Number(p);
    if (!Number.isNaN(idx) && String(idx) === p) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[idx];
    } else {
      cur = cur[p];
    }
  }
  return cur;
}
