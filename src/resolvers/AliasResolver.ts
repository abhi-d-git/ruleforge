import type { Namespaces, ResolveOptions, ResolveResult } from "./PathResolver.js";
import { resolvePath } from "./PathResolver.js";

/**
 * Convenience wrapper that resolves a list of candidate paths (fallback).
 * Returns first non-undefined value, along with the ResolveResult for that path.
 */
export function resolveFirst(ns: Namespaces, paths: string[], opts: ResolveOptions): ResolveResult {
  let last: ResolveResult = { value: undefined, usedPath: "", namespace: "payload", usedAlias: false };
  for (const p of paths) {
    const r = resolvePath(ns, p, opts);
    last = r;
    if (r.value !== undefined) return r;
  }
  return last;
}
