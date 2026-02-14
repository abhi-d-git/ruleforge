function isIndex(seg: string): boolean {
  if (seg.length === 0) return false;
  // "0" is valid; disallow "-1"
  const n = Number(seg);
  return Number.isInteger(n) && n >= 0 && String(n) === seg;
}

export function setByDotPath(obj: any, dotPath: string, value: any): void {
  const parts = dotPath.split(".").filter(Boolean);
  if (parts.length === 0) return;

  let cur: any = obj;

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    const last = i === parts.length - 1;
    const nextSeg = parts[i + 1];

    if (isIndex(seg)) {
      const idx = Number(seg);

      // ensure cur is an array
      if (!Array.isArray(cur)) {
        // If cur is empty object at root, we can't "convert" it safely.
        // But in normal flow we create arrays only when parent decides.
        // So here, assume caller created correct container.
        // We'll handle conversion when creating the child container below.
      }

      if (!Array.isArray(cur)) {
        // convert in-place if possible (only works if cur is a property value; root case handled by parent)
        // This function is used with a root object; numeric segment should only occur after a key segment.
        throw new Error(
          `Invalid array index segment '${seg}' at root or non-array container`,
        );
      }

      if (last) {
        cur[idx] = value;
        return;
      }

      // create next container if missing
      if (cur[idx] == null || typeof cur[idx] !== "object") {
        cur[idx] = nextSeg && isIndex(nextSeg) ? [] : {};
      }
      cur = cur[idx];
      continue;
    }

    // seg is object key
    if (last) {
      cur[seg] = value;
      return;
    }

    // ensure next container
    const wantArray = nextSeg ? isIndex(nextSeg) : false;
    if (cur[seg] == null || typeof cur[seg] !== "object") {
      cur[seg] = wantArray ? [] : {};
    } else {
      // if existing but wrong container type, replace (v1 deterministic)
      if (wantArray && !Array.isArray(cur[seg])) cur[seg] = [];
      if (!wantArray && Array.isArray(cur[seg])) cur[seg] = {};
    }

    cur = cur[seg];
  }
}
