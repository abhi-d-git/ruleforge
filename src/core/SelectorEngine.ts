import type { RuleEntryV1, MappingV1, MappingObjV1 } from "../types/spec.js";
import type { Namespaces, ResolveOptions } from "../resolvers/PathResolver.js";
import { resolvePath } from "../resolvers/PathResolver.js";

export type SelectorVar = "$X1" | "$X2";
export type SelectorBindings = Partial<Record<SelectorVar, number>>;

export type SelectorOutcome =
  | { kind: "none" }
  | {
      kind: "bound";
      bindings: SelectorBindings;
      roots: Partial<Record<SelectorVar, string>>;
    };

export interface SelectorContext {
  ns: Namespaces;
  resolveOpts: ResolveOptions;
}

/**
 * Binds $X1 (outer) then $X2 (nested) using conditions (AND equals-to-constant).
 *
 * Example conditions:
 *  - customers.$X1.fleet.id = "fleetId_5"
 *  - customers.$X1.devices.$X2.id = "deviceId_1"
 *
 * Binding:
 *  - bind $X1 using pure-$X1 conditions
 *  - bind $X2 using conditions containing $X2 (after $X1 is bound)
 */
export function bindSelectorsV1(
  entry: RuleEntryV1,
  ctx: SelectorContext,
): { ok: true; result: SelectorOutcome } | { ok: false; error: Error } {
  try {
    const conditions = entry.conditions ?? {};
    const keys = Object.keys(conditions);

    const usedVars = detectUsedVars(keys);
    if (usedVars.size === 0) return { ok: true, result: { kind: "none" } };

    for (const v of usedVars) {
      if (v !== "$X1" && v !== "$X2")
        throw new Error(`Unsupported selector var in v1: ${v}`);
    }

    const roots = detectRoots(keys);
    const bindings: SelectorBindings = {};

    // 0) evaluate fixed (no vars) conditions first
    const fixedKeys = keys.filter(
      (k) => !containsVar(k, "$X1") && !containsVar(k, "$X2"),
    );
    for (const k of fixedKeys) {
      const expected = conditions[k];
      const r = resolvePath(ctx.ns, k, ctx.resolveOpts);
      if (!matchesExpected(r.value, expected))
        return { ok: true, result: { kind: "none" } };
    }

    // 1) bind $X1 if used
    if (usedVars.has("$X1")) {
      const x1Root = roots["$X1"];
      if (!x1Root) throw new Error("Internal: $X1 used but root not found");

      const x1Keys = keys.filter(
        (k) => containsVar(k, "$X1") && !containsVar(k, "$X2"),
      );
      if (x1Keys.length === 0) return { ok: true, result: { kind: "none" } };

      const x1 = bindVarByScanningRoot(
        "$X1",
        x1Root,
        x1Keys,
        conditions,
        bindings,
        ctx,
      );
      if (x1 == null) return { ok: true, result: { kind: "none" } };
      bindings["$X1"] = x1;
    }

    // 2) bind $X2 if used
    if (usedVars.has("$X2")) {
      const x2RootRaw = roots["$X2"];
      if (!x2RootRaw) throw new Error("Internal: $X2 used but root not found");

      const x2Root = applyBindingsToPath(x2RootRaw, bindings);
      const x2Keys = keys.filter((k) => containsVar(k, "$X2"));

      const x2 = bindVarByScanningRoot(
        "$X2",
        x2Root,
        x2Keys,
        conditions,
        bindings,
        ctx,
      );
      if (x2 == null) return { ok: true, result: { kind: "none" } };
      bindings["$X2"] = x2;
    }

    // 3) final verify: all conditions with bindings applied
    for (const k of keys.filter((k) => containsAnyVar(k))) {
      const expected = conditions[k];
      const kk = applyBindingsToPath(k, bindings);
      const r = resolvePath(ctx.ns, kk, ctx.resolveOpts);
      if (!matchesExpected(r.value, expected))
        return { ok: true, result: { kind: "none" } };
    }

    return { ok: true, result: { kind: "bound", bindings, roots } };
  } catch (e: any) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function applyBindingsToPath(
  path: string,
  bindings: SelectorBindings,
): string {
  let out = path;
  if (bindings["$X1"] !== undefined) {
    out = out
      .replaceAll(".$X1.", `.${bindings["$X1"]}.`)
      .replaceAll(".$X1", `.${bindings["$X1"]}`);
  }
  if (bindings["$X2"] !== undefined) {
    out = out
      .replaceAll(".$X2.", `.${bindings["$X2"]}.`)
      .replaceAll(".$X2", `.${bindings["$X2"]}`);
  }
  return out;
}

export function applyBindingsToMappings(
  mappings: ReadonlyArray<MappingV1>,
  bindings: SelectorBindings,
): MappingV1[] {
  return mappings.map((m) => {
    if (typeof m === "string") return applyBindingsToPath(m, bindings);
    const mm = m as MappingObjV1;
    return { ...mm, path: applyBindingsToPath(mm.path, bindings) };
  });
}

/** ---------- internals ---------- */

function detectUsedVars(keys: string[]): Set<SelectorVar> {
  const s = new Set<SelectorVar>();
  for (const k of keys) {
    if (containsVar(k, "$X1")) s.add("$X1");
    if (containsVar(k, "$X2")) s.add("$X2");
  }
  return s;
}

/**
 * Root per variable:
 *  - customers.$X1.fleet.id  => $X1 root = "customers"
 *  - customers.$X1.devices.$X2.id => $X2 root = "customers.$X1.devices"
 */
function detectRoots(keys: string[]): Partial<Record<SelectorVar, string>> {
  const roots: Partial<Record<SelectorVar, string>> = {};

  for (const k of keys) {
    const r1 = extractRoot(k, "$X1");
    if (r1) roots["$X1"] = mergeRoot("$X1", roots["$X1"], r1);

    const r2 = extractRoot(k, "$X2");
    if (r2) roots["$X2"] = mergeRoot("$X2", roots["$X2"], r2);
  }

  const x2r = roots["$X2"];
  if (x2r && containsVar(x2r, "$X1") && !roots["$X1"]) {
    throw new Error(
      `$X2 root depends on $X1 but no $X1 root found. Root: ${x2r}`,
    );
  }

  return roots;
}

function mergeRoot(
  v: SelectorVar,
  existing: string | undefined,
  next: string,
): string {
  if (!existing) return next;
  if (existing === next) return existing;
  throw new Error(
    `v1 supports a single root per selector variable. ${v} roots: '${existing}' vs '${next}'`,
  );
}

function extractRoot(path: string, v: SelectorVar): string | null {
  const needle = `.${v}.`;
  const i = path.indexOf(needle);
  if (i >= 0) return path.slice(0, i);

  const tail = `.${v}`;
  if (path.endsWith(tail)) return path.slice(0, -tail.length);

  return null;
}

function containsVar(path: string, v: SelectorVar): boolean {
  return path.includes(`.${v}.`) || path.endsWith(`.${v}`);
}

function containsAnyVar(path: string): boolean {
  return containsVar(path, "$X1") || containsVar(path, "$X2");
}

/**
 * Scan root array to bind varName.
 * Skips conditions that still contain unresolved vars.
 */
function bindVarByScanningRoot(
  varName: SelectorVar,
  rootPath: string,
  condKeys: string[],
  conditions: Record<string, unknown>,
  bindingsAlready: SelectorBindings,
  ctx: SelectorContext,
): number | null {
  const rootResolved = resolvePath(ctx.ns, rootPath, ctx.resolveOpts);
  const arr = rootResolved.value;
  if (!Array.isArray(arr)) return null;

  for (let i = 0; i < arr.length; i++) {
    const trialBindings: SelectorBindings = {
      ...bindingsAlready,
      [varName]: i,
    };

    let ok = true;
    for (const k of condKeys) {
      const expected = conditions[k];
      const kk = applyBindingsToPath(k, trialBindings);

      if (containsAnyVar(kk)) continue; // unresolved var remains

      const r = resolvePath(ctx.ns, kk, ctx.resolveOpts);
      if (!matchesExpected(r.value, expected)) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }

  return null;
}

function matchesExpected(actual: any, expected: any): boolean {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}
