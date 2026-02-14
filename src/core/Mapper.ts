import type { RuleDocumentV1 } from "../types/spec.js";
import type { FunctionRegistry, MapperContext } from "../types/functions.js";
import type { MapResult } from "../types/result.js";
import { runInitializer } from "./Initializer.js";
import { runPreprocessors } from "./Preprocessor.js";
import { runRules } from "./RuleEngine.js";
import { runPostProcessors } from "./Postprocessor.js";

export interface MapperOptions {
  spec: RuleDocumentV1;
  functions?: FunctionRegistry;
  /** default: true (bare path => $payload) */
  allowBarePaths?: boolean;
  debug?: boolean;
}

export class Mapper {
  private spec: RuleDocumentV1;
  private fn: FunctionRegistry;
  private allowBarePaths: boolean;
  private debug: boolean;

  constructor(opts: MapperOptions) {
    this.spec = opts.spec;
    this.fn = opts.functions ?? {};
    this.allowBarePaths = opts.allowBarePaths ?? true;
    this.debug = opts.debug ?? false;
  }

  async map(input: unknown, ctx: MapperContext = {}): Promise<MapResult> {
    const init = await runInitializer(this.spec, this.fn, input, ctx);
    if (!init.ok) return init.result;

    const pre = await runPreprocessors(this.spec, this.fn, init.ns, ctx);
    if (!pre.ok) return pre.result;

    const ns = { payload: init.ns.payload, meta: init.ns.meta, pre: pre.pre };

    const mapped = await runRules(
      this.spec,
      this.fn,
      ns,
      ctx,
      this.allowBarePaths,
      init.inputType,
    );
    if (!mapped.ok) return mapped.result;

    const final = await runPostProcessors(
      this.spec,
      this.fn,
      mapped.value,
      ns,
      ctx,
      mapped.meta,
    );
    return finalizeResult(final, this.debug);
  }
}

function finalizeResult(result: MapResult, debug: boolean): MapResult {
  if (debug) return result;

  if (result.ok) {
    return { ok: true, value: result.value };
  }

  return { ok: false, error: result.error };
}
