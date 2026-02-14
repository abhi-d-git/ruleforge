import type { RuleDocumentV1 } from "../types/spec.js";
import type { FunctionRegistry, MapperContext } from "../types/functions.js";
import type { MapResult } from "../types/result.js";
import { err } from "./Errors.js";

export async function runPreprocessors(
  spec: RuleDocumentV1,
  fn: FunctionRegistry,
  ns: { payload: any; meta: any; pre: Record<string, any> }, // ✅ include pre seed
  ctx: MapperContext,
): Promise<
  { ok: true; pre: Record<string, any> } | { ok: false; result: MapResult }
> {
  // ✅ Seed with initializer pre so CDATA parsing etc stays available
  const out: Record<string, any> = { ...(ns.pre ?? {}) };

  try {
    for (const [key, ref] of Object.entries(spec.preprocessors ?? {})) {
      const f = fn.preprocessors?.[ref.function];
      if (!f) {
        return {
          ok: false,
          result: {
            ok: false,
            error: err(
              "PREPROCESSOR_ERROR",
              `Preprocessor not found: ${ref.function}`,
            ),
            meta: { inputType: "json", pre: {}, matched: {} },
          },
        };
      }

      // Preprocessors see pre as "current computed pre" (seed + previously computed)
      out[key] = await f({ payload: ns.payload, meta: ns.meta, pre: out }, ctx);
    }

    return { ok: true, pre: out };
  } catch (e: any) {
    return {
      ok: false,
      result: {
        ok: false,
        error: err("PREPROCESSOR_ERROR", e?.message ?? String(e), { cause: e }),
        meta: { inputType: "json", pre: {}, matched: {} },
      },
    };
  }
}
