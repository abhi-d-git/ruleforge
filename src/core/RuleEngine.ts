import type {
  RuleDocumentV1,
  RuleEntryV1,
  MappingV1,
  MappingObjV1,
} from "../types/spec.js";
import type { FunctionRegistry, MapperContext } from "../types/functions.js";
import type { MapError, MapResult, MapMeta } from "../types/result.js";
import type { MatchedInfo } from "../types/internal.js";

import { err } from "./Errors.js";
import { setByDotPath } from "./OutputBuilder.js";
import { TransformRegistry } from "../transforms/TransformRegistry.js";
import { resolvePath, type Namespaces } from "../resolvers/PathResolver.js";
import {
  bindSelectorsV1,
  applyBindingsToMappings,
  applyBindingsToPath,
  type SelectorBindings,
} from "./SelectorEngine.js";

export async function runRules(
  spec: RuleDocumentV1,
  fn: FunctionRegistry,
  ns: { payload: any; meta: any; pre: Record<string, any> },
  ctx: MapperContext,
  allowBarePaths: boolean,
  inputType: "json" | "xml",
): Promise<
  { ok: true; value: any; meta: MapMeta } | { ok: false; result: MapResult }
> {
  const out: any = {};
  const matched: Record<string, MatchedInfo | undefined> = {};

  const metaBase: MapMeta = {
    inputType,
    pre: ns.pre,
    matched,
  };

  const resolverOpts = {
    allowBarePaths,
    aliases: spec.aliases ?? {},
  };

  const namespaces: Namespaces = {
    payload: ns.payload,
    meta: ns.meta,
    pre: ns.pre,
  };

  const transforms = new TransformRegistry(fn.transforms);

  for (const [targetKey, ruleDef] of Object.entries(spec.rules ?? {})) {
    const entries: ReadonlyArray<RuleEntryV1> = Array.isArray(ruleDef)
      ? (ruleDef as ReadonlyArray<RuleEntryV1>)
      : [ruleDef as RuleEntryV1];

    const anyRequired = entries.some((e) => e.required === true);

    // ✅ Loop mode if target has a $X *segment*
    const isLoop = hasVarSegment(targetKey, "$X");

    if (!isLoop) {
      // -------------------------
      // NORMAL (non-loop) behavior
      // -------------------------
      let matchedAnyRule = false;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        let bindings: SelectorBindings | undefined;

        const sel = bindSelectorsV1(entry, {
          ns: namespaces,
          resolveOpts: resolverOpts,
        });
        if (!sel.ok) {
          const e: MapError = err(
            "INVALID_SELECTOR_ROOT",
            sel.error.message,
            { targetKey, ruleIndex: i },
            targetKey,
          );
          return { ok: false, result: { ok: false, error: e, meta: metaBase } };
        }
        if (sel.result.kind === "bound") bindings = sel.result.bindings;

        if (!conditionsMatch(entry, namespaces, resolverOpts, bindings))
          continue;
        matchedAnyRule = true;

        // value wins (v1 behavior)
        if ("value" in entry && entry.value !== undefined) {
          setByDotPath(out, targetKey, entry.value);
          matched[targetKey] = {
            ruleIndex: i,
            mappingPath: "(value)",
            selector: bindings ? sanitizeSelector(bindings) : undefined,
          };
          break;
        }

        const mappings = entry.mappings ?? [];
        const mres = resolveMappings(
          mappings,
          namespaces,
          resolverOpts,
          transforms,
          ctx,
          bindings,
        );
        if (!mres.ok) {
          const e: MapError = err(
            "TRANSFORM_ERROR",
            mres.error.message,
            mres.error.details,
            targetKey,
          );
          return { ok: false, result: { ok: false, error: e, meta: metaBase } };
        }

        if (mres.valueFound) {
          setByDotPath(out, targetKey, mres.value);
          matched[targetKey] = {
            ruleIndex: i,
            mappingPath: mres.usedPath,
            selector: bindings ? sanitizeSelector(bindings) : undefined,
          };
          break;
        }

        if (entry.required) {
          const e: MapError = err(
            "MISSING_REQUIRED_FIELD",
            `Required field '${targetKey}' matched rule ${i} but no mapping/value produced a result`,
            { attempted: mappings },
            targetKey,
          );
          return { ok: false, result: { ok: false, error: e, meta: metaBase } };
        }

        // matched rule but produced nothing -> stop evaluation
        matched[targetKey] = {
          ruleIndex: i,
          mappingPath: "",
          selector: bindings ? sanitizeSelector(bindings) : undefined,
        };
        break;
      }

      if (anyRequired && !matchedAnyRule) {
        const e: MapError = err(
          "NO_RULE_MATCHED_REQUIRED",
          `Required field '${targetKey}' did not match any rule entry`,
          { targetKey },
          targetKey,
        );
        return { ok: false, result: { ok: false, error: e, meta: metaBase } };
      }

      continue;
    }

    // -------------------------
    // LOOP mode: target key has $X
    // -------------------------
    // Determine loop driver prefix from first path containing $X
    const driverPrefix = findLoopDriverPrefix(entries);
    if (!driverPrefix) {
      const e: MapError = err(
        "INVALID_LOOP_RULE",
        `Looped target '${targetKey}' contains $X but no mapping/condition path contains $X to infer driver array`,
        { targetKey },
        targetKey,
      );
      return { ok: false, result: { ok: false, error: e, meta: metaBase } };
    }

    const driverResolved = resolvePath(namespaces, driverPrefix, resolverOpts);
    const driverVal = driverResolved.value;

    const arr = Array.isArray(driverVal) ? driverVal : null;
    const len = arr ? arr.length : 0;

    // required loop means "at least 1 element produced"
    let producedCount = 0;
    let matchedAnyRuleAcrossAnyIndex = false;

    for (let x = 0; x < len; x++) {
      const loopBindings = { $X: x };

      // For each index, evaluate entries top-to-bottom (first match wins per index)
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;

        // existing selector binding ($X1/$X2) still allowed (conditions-style)
        let selBindings: SelectorBindings | undefined;
        const sel = bindSelectorsV1(entry, {
          ns: namespaces,
          resolveOpts: resolverOpts,
        });
        if (!sel.ok) {
          const e: MapError = err(
            "INVALID_SELECTOR_ROOT",
            sel.error.message,
            { targetKey, ruleIndex: i },
            targetKey,
          );
          return { ok: false, result: { ok: false, error: e, meta: metaBase } };
        }
        if (sel.result.kind === "bound") selBindings = sel.result.bindings;

        // merge loop binding into selector bindings for substitutions
        const combined = mergeBindings(selBindings, loopBindings);

        if (!conditionsMatch(entry, namespaces, resolverOpts, combined))
          continue;

        matchedAnyRuleAcrossAnyIndex = true;

        const concreteTarget = substituteVar(targetKey, loopBindings);

        // value wins (v1 semantics)
        if ("value" in entry && entry.value !== undefined) {
          setByDotPath(out, concreteTarget, entry.value);
          producedCount++;
          matched[concreteTarget] = {
            ruleIndex: i,
            mappingPath: "(value)",
            selector: combined ? sanitizeSelector(combined) : undefined,
          };
          break; // stop entries for this index
        }

        const mappings = (entry.mappings ?? []).map((m) =>
          substituteVarInMapping(m, loopBindings),
        );

        const mres = resolveMappings(
          mappings,
          namespaces,
          resolverOpts,
          transforms,
          ctx,
          combined,
        );
        if (!mres.ok) {
          const e: MapError = err(
            "TRANSFORM_ERROR",
            mres.error.message,
            mres.error.details,
            concreteTarget,
          );
          return { ok: false, result: { ok: false, error: e, meta: metaBase } };
        }

        if (mres.valueFound) {
          setByDotPath(out, concreteTarget, mres.value);
          producedCount++;
          matched[concreteTarget] = {
            ruleIndex: i,
            mappingPath: mres.usedPath,
            selector: combined ? sanitizeSelector(combined) : undefined,
          };
          break;
        }

        // if this entry is required, we do NOT fail per-index in v0.2.
        // We'll enforce "at least one produced" at the end if required exists in entries.
        break;
      }
    }

    if (anyRequired && producedCount === 0) {
      const e: MapError = err(
        "MISSING_REQUIRED_FIELD",
        `Required looped field '${targetKey}' produced no output elements`,
        {
          driverPrefix,
          driverNamespace: driverResolved.namespace,
          driverUsedPath: driverResolved.usedPath,
        },
        targetKey,
      );
      return { ok: false, result: { ok: false, error: e, meta: metaBase } };
    }

    // If required but no rule matched at all for any index, keep same error family
    if (anyRequired && !matchedAnyRuleAcrossAnyIndex) {
      const e: MapError = err(
        "NO_RULE_MATCHED_REQUIRED",
        `Required looped field '${targetKey}' did not match any rule entry for any array element`,
        { targetKey, driverPrefix },
        targetKey,
      );
      return { ok: false, result: { ok: false, error: e, meta: metaBase } };
    }
  }

  return { ok: true, value: out, meta: metaBase };
}

/** true if dot-path contains a segment equal to varName (e.g. "$X") */
function hasVarSegment(path: string, varName: "$X"): boolean {
  return (path ?? "").split(".").some((s) => s === varName);
}

function substituteVar(path: string, vars: { $X: number }): string {
  return (path ?? "")
    .split(".")
    .map((seg) => (seg === "$X" ? String(vars.$X) : seg))
    .join(".");
}

function substituteVarInMapping(m: MappingV1, vars: { $X: number }): MappingV1 {
  if (typeof m === "string") return substituteVar(m, vars);
  return {
    ...m,
    path: substituteVar(m.path, vars),
  };
}

/**
 * Find driver prefix:
 * - use first mapping path containing "$X" -> take prefix before "$X"
 * - else use first condition path containing "$X"
 */
function findLoopDriverPrefix(
  entries: ReadonlyArray<RuleEntryV1>,
): string | null {
  for (const e of entries) {
    for (const m of e.mappings ?? []) {
      const p = typeof m === "string" ? m : m.path;
      const pref = prefixBeforeVarSegment(p, "$X");
      if (pref) return pref;
    }
  }
  for (const e of entries) {
    for (const k of Object.keys(e.conditions ?? {})) {
      const pref = prefixBeforeVarSegment(k, "$X");
      if (pref) return pref;
    }
  }
  return null;
}

/** returns "a.b.c" for "a.b.$X.d", else null */
function prefixBeforeVarSegment(path: string, varName: "$X"): string | null {
  const parts = (path ?? "").trim().split(".").filter(Boolean);
  const idx = parts.findIndex((p) => p === varName);
  if (idx <= 0) return null;
  return parts.slice(0, idx).join(".");
}

function mergeBindings(
  sel: SelectorBindings | undefined,
  loop: { $X: number },
): SelectorBindings {
  // SelectorBindings type in your code likely maps "$X1" -> number etc.
  // We'll merge safely.
  return { ...(sel ?? {}), ...loop } as any;
}

function conditionsMatch(
  entry: RuleEntryV1,
  ns: Namespaces,
  resolverOpts: {
    allowBarePaths: boolean;
    aliases?: Record<string, ReadonlyArray<string>>;
  },
  bindings?: SelectorBindings,
): boolean {
  const cond = entry.conditions ?? {};
  const keys = Object.keys(cond);
  if (keys.length === 0) return true;

  for (const k of keys) {
    const expected = cond[k];
    const kk = bindings ? applyBindingsToPath(k, bindings) : k;

    // If still unresolved selector tokens remain, treat as no match.
    if (kk.includes(".$X1") || kk.includes(".$X2")) return false;

    const r = resolvePath(ns, kk, resolverOpts);
    if (!matchesExpected(r.value, expected)) return false;
  }

  return true;
}

function matchesExpected(actual: any, expected: any): boolean {
  if (Array.isArray(expected)) {
    return expected.includes(actual);
  }
  return actual === expected;
}

function resolveMappings(
  mappings: ReadonlyArray<MappingV1>,
  ns: Namespaces,
  resolverOpts: {
    allowBarePaths: boolean;
    aliases?: Record<string, ReadonlyArray<string>>;
  },
  transforms: TransformRegistry,
  ctx: MapperContext,
  bindings?: SelectorBindings,
):
  | { ok: true; valueFound: boolean; value?: any; usedPath: string }
  | { ok: false; error: { message: string; details?: any } } {
  const m2 = bindings ? applyBindingsToMappings(mappings, bindings) : mappings;

  let lastUsed = "";
  for (const m of m2) {
    const path = typeof m === "string" ? m : (m as MappingObjV1).path;
    const transformNames =
      typeof m === "string" ? undefined : (m as MappingObjV1).transform;

    if (path.includes(".$X1") || path.includes(".$X2")) continue;

    const r = resolvePath(ns, path, resolverOpts);
    lastUsed = r.usedPath;

    if (r.value === undefined) continue;

    try {
      const v = transforms.apply(r.value, transformNames, ctx);
      return { ok: true, valueFound: true, value: v, usedPath: r.usedPath };
    } catch (e: any) {
      return {
        ok: false,
        error: {
          message: e?.message ?? String(e),
          details: { path, transformNames },
        },
      };
    }
  }

  return { ok: true, valueFound: false, usedPath: lastUsed };
}

function sanitizeSelector(bindings: SelectorBindings): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}
