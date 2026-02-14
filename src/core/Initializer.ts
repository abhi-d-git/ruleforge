import type { RuleDocumentV1 } from "../types/spec.js";
import type { FunctionRegistry, MapperContext } from "../types/functions.js";
import type { MapResult } from "../types/result.js";
import { err } from "./Errors.js";
import { normalizePayload } from "../parsing/normalize.js";

export async function runInitializer(
  spec: RuleDocumentV1,
  fn: FunctionRegistry,
  input: unknown,
  ctx: MapperContext,
): Promise<
  | {
      ok: true;
      ns: { payload: any; meta: any; pre: any };
      inputType: "json" | "xml";
    }
  | { ok: false; result: MapResult }
> {
  try {
    let meta: any = {};
    let payload: any = input;
    let hint: "json" | "xml" | "auto" = "auto";
    let pre: any = {};

    if (spec.initializer) {
      const name = spec.initializer.function;
      const initFn = fn.initializer?.[name];
      if (!initFn) {
        return {
          ok: false,
          result: {
            ok: false,
            error: err("INITIALIZER_ERROR", `Initializer not found: ${name}`),
            meta: { inputType: "json", pre: {}, matched: {} },
          },
        };
      }
      const r = await initFn(input, ctx);
      meta = r.metadata ?? {};
      payload = r.payload ?? payload;
      pre = r.pre ?? {};
      hint = (r.payloadType ?? "auto") as any;
    }

    const norm = await normalizePayload(payload, hint);

    return {
      ok: true,
      ns: { payload: norm.obj, meta, pre },
      inputType: norm.kind,
    };
  } catch (e: any) {
    return {
      ok: false,
      result: {
        ok: false,
        error: err("PAYLOAD_PARSE_ERROR", e?.message ?? String(e), {
          cause: e,
        }),
        meta: { inputType: "json", pre: {}, matched: {} },
      },
    };
  }
}
