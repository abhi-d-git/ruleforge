import type { RuleDocumentV1 } from "../types/spec.js";
import type { FunctionRegistry, MapperContext } from "../types/functions.js";
import type { MapMeta, MapResult } from "../types/result.js";
import { err } from "./Errors.js";

export async function runPostProcessors(
  spec: RuleDocumentV1,
  fn: FunctionRegistry,
  out: any,
  ns: { payload: any; meta: any; pre: Record<string, any> },
  ctx: MapperContext,
  meta: MapMeta,
): Promise<MapResult> {
  try {
    let cur = out;

    for (const name of spec.postProcessors ?? []) {
      const f = fn.postProcessors?.[name];
      if (!f)
        return {
          ok: false,
          error: err("PREPROCESSOR_ERROR", `PostProcessor not found: ${name}`),
          meta,
        };

      cur = await f(
        cur,
        { payload: ns.payload, meta: ns.meta, pre: ns.pre },
        ctx,
      );
    }

    return { ok: true, value: cur, meta };
  } catch (e: any) {
    return {
      ok: false,
      error: err("PREPROCESSOR_ERROR", e?.message ?? String(e), { cause: e }),
      meta,
    };
  }
}
