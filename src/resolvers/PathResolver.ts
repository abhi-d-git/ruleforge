import { deepGet } from "../utils/deepGet.js";

export type NamespaceName = "payload" | "meta" | "pre";

export interface Namespaces {
  payload: any;
  meta: any;
  pre: any;
}

export interface ResolveOptions {
  /** If true, bare paths resolve against $payload */
  allowBarePaths: boolean;
  /** Aliases apply to PAYLOAD only */
  aliases?: Record<string, ReadonlyArray<string>>;
}

export interface ResolveResult {
  value: any;
  /** the concrete path that was actually used (after alias expansion) */
  usedPath: string;
  /** namespace where it was resolved */
  namespace: NamespaceName;
  /** true if used alias expansion */
  usedAlias: boolean;
}

/**
 * Resolve paths with namespaces:
 * - $payload.*, $meta.*, $pre.*
 * - bare paths default to $payload if allowBarePaths=true
 *
 * Aliases:
 * - apply to payload-only
 * - support alias keys of multiple segments (e.g., "source.system")
 * - longest alias key match wins
 *
 * NOTE: selector variable X is handled by SelectorEngine (not here).
 */
export function resolvePath(
  ns: Namespaces,
  path: string,
  opts: ResolveOptions,
): ResolveResult {
  const p = (path ?? "").trim();
  if (!p)
    return {
      value: undefined,
      usedPath: "",
      namespace: "payload",
      usedAlias: false,
    };

  // Explicit namespace
  const explicit = parseExplicitNamespace(p);
  if (explicit) {
    const { namespace, innerPath } = explicit;
    const base =
      namespace === "payload"
        ? ns.payload
        : namespace === "meta"
          ? ns.meta
          : ns.pre;
    const value = innerPath ? deepGet(base, innerPath) : base;
    const usedPath = innerPath ? `$${namespace}.${innerPath}` : `$${namespace}`;
    return { value, usedPath, namespace, usedAlias: false };
  }

  // Bare path
  if (!opts.allowBarePaths) {
    return {
      value: undefined,
      usedPath: p,
      namespace: "payload",
      usedAlias: false,
    };
  }

  // Alias expansion (payload default, but candidates may point to $payload/$pre/$meta)
  const expanded = expandAlias(p, opts.aliases ?? {});
  if (expanded) {
    for (const candidate of expanded.candidates) {
      // candidate can be "$pre.x.y" or "$meta.x" or a payload path
      const r = resolvePathNoAlias(ns, candidate, opts);
      if (r.value !== undefined) {
        return {
          ...r,
          usedPath: r.usedPath,
          usedAlias: true,
        };
      }
    }

    // none matched: return undefined but report first candidate as "used"
    const first = expanded.candidates[0] ?? p;
    const r0 = resolvePathNoAlias(ns, first, opts);
    return { ...r0, usedAlias: true };
  }

  // No alias; resolve directly from payload
  return {
    value: deepGet(ns.payload, p),
    usedPath: p,
    namespace: "payload",
    usedAlias: false,
  };
}

function resolvePathNoAlias(
  ns: Namespaces,
  path: string,
  opts: ResolveOptions,
): ResolveResult {
  const p = (path ?? "").trim();
  if (!p) {
    return {
      value: undefined,
      usedPath: "",
      namespace: "payload",
      usedAlias: false,
    };
  }

  const explicit = parseExplicitNamespace(p);
  if (explicit) {
    const { namespace, innerPath } = explicit;
    const base =
      namespace === "payload"
        ? ns.payload
        : namespace === "meta"
          ? ns.meta
          : ns.pre;
    const value = innerPath ? deepGet(base, innerPath) : base;
    const usedPath = innerPath ? `$${namespace}.${innerPath}` : `$${namespace}`;
    return { value, usedPath, namespace, usedAlias: false };
  }

  // bare path => payload (no alias here)
  if (!opts.allowBarePaths) {
    return {
      value: undefined,
      usedPath: p,
      namespace: "payload",
      usedAlias: false,
    };
  }

  return {
    value: deepGet(ns.payload, p),
    usedPath: p,
    namespace: "payload",
    usedAlias: false,
  };
}

function parseExplicitNamespace(
  p: string,
): { namespace: NamespaceName; innerPath: string } | null {
  if (p === "$payload") return { namespace: "payload", innerPath: "" };
  if (p === "$meta") return { namespace: "meta", innerPath: "" };
  if (p === "$pre") return { namespace: "pre", innerPath: "" };

  if (p.startsWith("$payload."))
    return { namespace: "payload", innerPath: p.slice("$payload.".length) };
  if (p.startsWith("$meta."))
    return { namespace: "meta", innerPath: p.slice("$meta.".length) };
  if (p.startsWith("$pre."))
    return { namespace: "pre", innerPath: p.slice("$pre.".length) };

  return null;
}

/**
 * Expands payload aliasing.
 *
 * Supports:
 * - alias key is one segment: "customers"
 * - alias key is multi-segment: "source.system"
 *
 * If input path is "source.system.id" and alias key is "source.system",
 * restPath is "id" and candidate becomes "<aliasRoot>.id".
 *
 * Longest alias-key match wins to avoid partial overrides.
 */
export function expandAlias(
  path: string,
  aliases?: Record<string, ReadonlyArray<string>>,
): { aliasKey: string; candidates: string[] } | null {
  if (!aliases || Object.keys(aliases).length === 0) return null;

  const best = findLongestAliasKeyMatch(path, aliases);
  if (!best) return null;

  const { key, roots } = best;

  const rest = path.length === key.length ? "" : path.slice(key.length + 1); // +1 for "."
  const candidates = roots.map((r) => (rest ? `${r}.${rest}` : r));
  return { aliasKey: key, candidates };
}

function findLongestAliasKeyMatch(
  path: string,
  aliases: Record<string, ReadonlyArray<string>>,
): { key: string; roots: ReadonlyArray<string> } | null {
  let bestKey: string | null = null;
  for (const key of Object.keys(aliases)) {
    if (path === key || path.startsWith(key + ".")) {
      if (bestKey == null || key.length > bestKey.length) bestKey = key;
    }
  }
  if (!bestKey) return null;
  const roots = aliases[bestKey] ?? [];
  if (!roots.length) return null;
  return { key: bestKey, roots };
}
