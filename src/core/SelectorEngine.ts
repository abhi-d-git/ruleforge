import type { RuleEntryV1 } from "../types/spec.js";
import { resolvePath, type Namespaces } from "../resolvers/PathResolver.js";
import { matchesExpected } from "./ConditionEvaluator.js";

// --------------------
// Types
// --------------------

export type SelectorVar = `$X${number}`; // runtime-checked
export type SelectorBindings = Record<string, number>;

export interface SelectorContext {
  ns: Namespaces;
  resolveOpts: {
    allowBarePaths: boolean;
    aliases?: Record<string, ReadonlyArray<string>>;
  };
}

export type SelectorOutcome =
  | { kind: "none" }
  | { kind: "bound"; bindings: SelectorBindings; roots: Record<string, string> }
  | {
      kind: "boundMany";
      bindings: SelectorBindings[];
      roots: Record<string, string>;
    };

// --------------------
// Guardrails
// --------------------

const MAX_VARS = 10; // $X1..$X10
const MAX_SOLUTIONS = 10_000; // cap results returned
const MAX_SCAN_PER_ARRAY = 5_000; // cap scanning a single array
const MAX_ATTEMPTS = 200_000; // cap total DFS node expansions (critical)

// --------------------
// Public APIs
// --------------------

export function bindSelectorsV1(
  entry: RuleEntryV1,
  ctx: SelectorContext,
): { ok: true; result: SelectorOutcome } | { ok: false; error: Error } {
  const r = bindSelectorsAllV1(entry, ctx);
  if (!r.ok) return r;

  if (r.result.kind === "boundMany") {
    const first = r.result.bindings[0];
    if (!first) return { ok: true, result: { kind: "none" } };
    return {
      ok: true,
      result: { kind: "bound", bindings: first, roots: r.result.roots },
    };
  }
  return r;
}

export function bindSelectorsAllV1(
  entry: RuleEntryV1,
  ctx: SelectorContext,
): { ok: true; result: SelectorOutcome } | { ok: false; error: Error } {
  try {
    const conditions = entry.conditions ?? {};
    const keys = Object.keys(conditions);

    // 1) detect used vars ($X1..$X10) from condition keys
    const usedVars = detectUsedVars(keys);
    if (usedVars.length === 0) return { ok: true, result: { kind: "none" } };

    if (usedVars.length > MAX_VARS) {
      throw new Error(
        `Too many selector variables (${usedVars.length}). Max supported is ${MAX_VARS}.`,
      );
    }

    // 2) infer roots per var (prefix up to var segment)
    const roots = detectRoots(keys, usedVars);

    // 3) Evaluate fixed conditions (NO vars) early  ✅ FIXED
    const fixedKeys = keys.filter((k) => !hasAnyVarSegment(k));
    for (const k of fixedKeys) {
      const expected = conditions[k];
      const r = resolvePath(ctx.ns, k, ctx.resolveOpts);

      const m = matchesExpected(r.value, expected);
      if (!m.ok) throw new Error(m.error); // or return INVALID_CONDITION
      if (!m.matched) {
        return { ok: true, result: { kind: "none" } };
      }
    }

    // 4) Compile condition list (only var-containing conditions)
    const condList: Array<{ key: string; expected: any; vars: SelectorVar[] }> =
      keys
        .filter((k) => hasAnyVarSegment(k))
        .map((k) => ({
          key: k,
          expected: conditions[k],
          vars: varsInPath(k),
        }));

    // 5) Variable ordering heuristic:
    // Prefer vars that appear in the most conditions (more constrained) first.
    const order = orderVarsByConstraintStrength(usedVars, condList);

    // 6) DFS search with attempt guardrail
    const solutions: SelectorBindings[] = [];
    const bindings: SelectorBindings = {};
    const state = { attempts: 0 };

    dfsBind({
      ctx,
      order,
      roots,
      condList,
      idx: 0,
      bindings,
      solutions,
      state,
    });

    if (solutions.length === 0) return { ok: true, result: { kind: "none" } };
    return {
      ok: true,
      result: { kind: "boundMany", bindings: solutions, roots },
    };
  } catch (e: any) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// --------------------
// DFS core
// --------------------

function dfsBind(args: {
  ctx: SelectorContext;
  order: SelectorVar[];
  roots: Record<string, string>;
  condList: Array<{ key: string; expected: any; vars: SelectorVar[] }>;
  idx: number;
  bindings: SelectorBindings;
  solutions: SelectorBindings[];
  state: { attempts: number };
}): void {
  const { ctx, order, roots, condList, idx, bindings, solutions, state } = args;

  if (solutions.length >= MAX_SOLUTIONS) return;
  if (state.attempts >= MAX_ATTEMPTS) return;

  // If all vars assigned, validate all conditions fully and record solution.
  if (idx >= order.length) {
    for (const c of condList) {
      const kk = applyBindingsToPath(c.key, bindings);
      if (hasUnresolvedSelectorToken(kk)) return;
      const r = resolvePath(ctx.ns, kk, ctx.resolveOpts);
      const m = matchesExpected(r.value, c.expected);
      if (!m.ok) throw new Error(m.error); // or return INVALID_CONDITION
      if (!m.matched) return;
    }
    solutions.push({ ...bindings });
    return;
  }

  const v = order[idx]!;
  const rootTpl = roots[v];
  if (!rootTpl) return;

  const rootConcrete = applyBindingsToPath(rootTpl, bindings);
  if (hasUnresolvedSelectorToken(rootConcrete)) return;

  const rr = resolvePath(ctx.ns, rootConcrete, ctx.resolveOpts);
  const arr = rr.value;
  if (!Array.isArray(arr)) return;

  const maxScan = Math.min(arr.length, MAX_SCAN_PER_ARRAY);

  for (let i = 0; i < maxScan; i++) {
    state.attempts++;
    if (state.attempts >= MAX_ATTEMPTS) return;

    bindings[v] = i;

    // Early pruning: check any conditions that became fully grounded by setting this var.
    if (partialConditionsHold(condList, bindings, ctx)) {
      dfsBind({ ...args, idx: idx + 1 });
      if (solutions.length >= MAX_SOLUTIONS) {
        delete bindings[v];
        return;
      }
    }

    delete bindings[v];
  }
}

function partialConditionsHold(
  condList: Array<{ key: string; expected: any; vars: SelectorVar[] }>,
  bindings: SelectorBindings,
  ctx: SelectorContext,
): boolean {
  for (const c of condList) {
    // only evaluate conditions where all vars are assigned
    for (const v of c.vars) {
      if (typeof bindings[v] !== "number") {
        // not fully bound yet
        continue;
      }
    }

    // Check fully-bound conditions only
    let allBound = true;
    for (const v of c.vars) {
      if (typeof bindings[v] !== "number") {
        allBound = false;
        break;
      }
    }
    if (!allBound) continue;

    const kk = applyBindingsToPath(c.key, bindings);
    if (hasUnresolvedSelectorToken(kk)) return false;

    const r = resolvePath(ctx.ns, kk, ctx.resolveOpts);
    const m = matchesExpected(r.value, c.expected);
    if (!m.ok) throw new Error(m.error); // or return INVALID_CONDITION
    if (!m.matched) return false;
  }
  return true;
}

// --------------------
// Variable ordering
// --------------------

function orderVarsByConstraintStrength(
  usedVars: SelectorVar[],
  condList: Array<{ key: string; expected: any; vars: SelectorVar[] }>,
): SelectorVar[] {
  const freq = new Map<SelectorVar, number>();
  for (const v of usedVars) freq.set(v, 0);

  for (const c of condList) {
    for (const v of c.vars) {
      if (freq.has(v)) freq.set(v, (freq.get(v) ?? 0) + 1);
    }
  }

  return usedVars.slice().sort((a, b) => {
    const fa = freq.get(a) ?? 0;
    const fb = freq.get(b) ?? 0;
    if (fb !== fa) return fb - fa; // more constrained first
    // tie-break: numeric order
    return compareSelectorVar(a, b);
  });
}

// --------------------
// Root inference
// --------------------

function detectRoots(
  keys: string[],
  usedVars: SelectorVar[],
): Record<string, string> {
  const roots: Record<string, string> = {};
  for (const v of usedVars) {
    let best: string | null = null;
    for (const k of keys) {
      const pref = prefixBeforeVarSegment(k, v);
      if (!pref) continue;
      if (best == null || pref.length > best.length) best = pref;
    }
    if (best) roots[v] = best;
  }
  return roots;
}

function prefixBeforeVarSegment(
  path: string,
  varName: SelectorVar,
): string | null {
  const parts = (path ?? "").trim().split(".").filter(Boolean);
  const idx = parts.findIndex((p) => p === varName);
  if (idx <= 0) return null;
  return parts.slice(0, idx).join(".");
}

// --------------------
// Var detection utilities
// --------------------

function detectUsedVars(keys: string[]): SelectorVar[] {
  const set = new Set<string>();
  for (const k of keys) for (const v of varsInPath(k)) set.add(v);

  const out: SelectorVar[] = [];
  for (const raw of set) {
    if (!/^(\$X([1-9]|10))$/.test(raw)) {
      throw new Error(`Unsupported selector var: ${raw}. Supported: $X1..$X10`);
    }
    out.push(raw as SelectorVar);
  }
  return out;
}

function varsInPath(path: string): SelectorVar[] {
  const parts = (path ?? "").split(".");
  const out: SelectorVar[] = [];
  for (const p of parts) {
    if (/^\$X([1-9]|10)$/.test(p)) out.push(p as SelectorVar);
  }
  return out;
}

function hasAnyVarSegment(path: string): boolean {
  return (
    /\.\$X([1-9]|10)(\.|$)/.test(path) || /^\$X([1-9]|10)(\.|$)/.test(path)
  );
}

function hasUnresolvedSelectorToken(p: string): boolean {
  return /\.\$X\d+(\.|$)/.test(p) || /^\$X\d+(\.|$)/.test(p);
}

function compareSelectorVar(a: SelectorVar, b: SelectorVar): number {
  const na = Number(a.slice(2));
  const nb = Number(b.slice(2));
  return na - nb;
}

// --------------------
// Binding substitution
// --------------------

export function applyBindingsToPath(
  path: string,
  bindings: SelectorBindings,
): string {
  const parts = (path ?? "").split(".");
  return parts
    .map((seg) => {
      if (/^\$X\d+$/.test(seg)) {
        const v = bindings[seg];
        return typeof v === "number" ? String(v) : seg;
      }
      return seg;
    })
    .join(".");
}

export function applyBindingsToMappings(
  mappings: ReadonlyArray<any>,
  bindings: SelectorBindings,
): ReadonlyArray<any> {
  return mappings.map((m) => {
    if (typeof m === "string") return applyBindingsToPath(m, bindings);
    return { ...m, path: applyBindingsToPath(m.path, bindings) };
  });
}

// --------------------
// Expected matching
// --------------------

// function matchesExpected(actual: any, expected: any): boolean {
//   if (Array.isArray(expected)) return expected.includes(actual);
//   return actual === expected;
// }

// function matchesExpected(actual: any, expected: any): boolean {
//   // Operator object syntax
//   if (expected && typeof expected === "object" && !Array.isArray(expected)) {
//     if ("equalsIgnoreCase" in expected) {
//       return (
//         typeof actual === "string" &&
//         typeof expected.equalsIgnoreCase === "string" &&
//         actual.toLowerCase() === expected.equalsIgnoreCase.toLowerCase()
//       );
//     }

//     if ("inIgnoreCase" in expected) {
//       if (!Array.isArray(expected.inIgnoreCase)) return false;
//       if (typeof actual !== "string") return false;

//       const lower = actual.toLowerCase();
//       return expected.inIgnoreCase.some(
//         (v: any) => typeof v === "string" && v.toLowerCase() === lower,
//       );
//     }
//   }

//   // existing behavior
//   if (Array.isArray(expected)) {
//     return expected.includes(actual);
//   }

//   return actual === expected;
// }
