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

export function deepGetWithQ(base: any, path: string): any {
  const p = (path ?? "").trim();
  if (!p) return base;

  // NOTE: This assumes your deepGet currently expects dot paths.
  // If your deepGet supports escaping/brackets, we can align later,
  // but this solves the XML array/object issue immediately.

  const segs = p.split(".").filter(Boolean);
  let cur: any = base;

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const isLast = i === segs.length - 1;

    if (seg === "?") {
      const next = segs[i + 1];
      const nextIsIndex = next !== undefined && /^\d+$/.test(next);

      // Case: want an array context (last segment OR followed by an index)
      if (isLast || nextIsIndex) {
        if (Array.isArray(cur)) {
          // keep as array
          continue;
        }
        if (cur && typeof cur === "object") {
          cur = [cur]; // wrap singleton
          continue;
        }
        return undefined;
      }

      // Case: followed by a property => treat array as "take first"
      if (Array.isArray(cur)) {
        cur = cur[0];
        continue;
      }
      if (cur && typeof cur === "object") {
        // keep object
        continue;
      }
      return undefined;
    }

    // numeric index support (common when bindings apply 0/1/2)
    if (/^\d+$/.test(seg)) {
      const idx = Number(seg);
      if (!Array.isArray(cur)) return undefined;
      cur = cur[idx];
      continue;
    }

    if (cur == null) return undefined;
    cur = cur[seg];
  }

  return cur;
}
