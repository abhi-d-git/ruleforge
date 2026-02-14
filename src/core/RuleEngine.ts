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

    let matchedAnyRule = false;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;

      // -------------------------
      // 1️⃣ Bind selectors
      // -------------------------
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

      if (sel.result.kind === "bound") {
        bindings = sel.result.bindings;
      }

      // -------------------------
      // 2️⃣ Evaluate conditions
      // -------------------------
      if (!conditionsMatch(entry, namespaces, resolverOpts, bindings)) {
        continue;
      }

      matchedAnyRule = true;

      // -------------------------
      // 3️⃣ Constant value support
      // -------------------------
      if ("value" in entry && entry.value !== undefined) {
        setByDotPath(out, targetKey, entry.value);

        matched[targetKey] = {
          ruleIndex: i,
          mappingPath: "(value)",
          selector: bindings ? sanitizeSelector(bindings) : undefined,
        };

        break; // stop at first matched rule
      }

      // -------------------------
      // 4️⃣ Resolve mappings (fallback list)
      // -------------------------
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

      // -------------------------
      // 5️⃣ Required but no value
      // -------------------------
      if (entry.required) {
        const e: MapError = err(
          "MISSING_REQUIRED_FIELD",
          `Required field '${targetKey}' matched rule ${i} but no mapping/value produced a result`,
          { attempted: mappings },
          targetKey,
        );

        return { ok: false, result: { ok: false, error: e, meta: metaBase } };
      }

      // Rule matched but produced no value and not required → stop evaluation
      matched[targetKey] = {
        ruleIndex: i,
        mappingPath: "",
        selector: bindings ? sanitizeSelector(bindings) : undefined,
      };

      break;
    }

    // -------------------------
    // 6️⃣ Required but no rule matched at all
    // -------------------------
    if (anyRequired && !matchedAnyRule) {
      const e: MapError = err(
        "NO_RULE_MATCHED_REQUIRED",
        `Required field '${targetKey}' did not match any rule entry`,
        { targetKey },
        targetKey,
      );

      return { ok: false, result: { ok: false, error: e, meta: metaBase } };
    }
  }

  return { ok: true, value: out, meta: metaBase };
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
