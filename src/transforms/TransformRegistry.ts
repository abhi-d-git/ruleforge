import type {
  FunctionRegistry,
  MapperContext,
  TransformFn,
} from "../types/functions.js";
import { builtInTransforms } from "./builtins.js";

export class TransformRegistry {
  private map: Record<string, TransformFn>;

  constructor(fn?: FunctionRegistry["transforms"]) {
    this.map = { ...builtInTransforms, ...(fn ?? {}) } as any;
  }

  apply(
    value: unknown,
    transformNames: ReadonlyArray<string> | undefined,
    ctx: MapperContext,
  ): unknown {
    let v = value;
    for (const name of transformNames ?? []) {
      const t = this.map[name];
      if (!t) throw new Error(`Unknown transform: ${name}`);
      v = t(v, ctx);
    }
    return v;
  }
}
