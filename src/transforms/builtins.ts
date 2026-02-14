export const builtInTransforms = {
  trim: (v: unknown) => (typeof v === "string" ? v.trim() : v),
  upper: (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v),
  lower: (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v),
  toString: (v: unknown) => (v == null ? v : String(v)),
  toNumber: (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`toNumber: NaN for value '${v}'`);
      return n;
    }
    throw new Error(`toNumber: unsupported type '${typeof v}'`);
  },
  toBoolean: (v: unknown) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.toLowerCase().trim();
      if (s === "true") return true;
      if (s === "false") return false;
    }
    throw new Error(`toBoolean: unsupported value '${String(v)}'`);
  },
} as const;
