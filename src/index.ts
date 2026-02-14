export type {
  RuleDocumentV1,
  RuleEntryV1,
  MappingV1,
  MappingObjV1,
  PayloadType,
} from "./types/spec.js";
export type {
  MapResult,
  MapMeta,
  MapError,
  MapWarning,
} from "./types/result.js";
export type { FunctionRegistry, MapperContext } from "./types/functions.js";
export { Mapper } from "./core/Mapper.js";

import type { MapperOptions } from "./core/Mapper.js";
import { Mapper as MapperClass } from "./core/Mapper.js";

export function createMapper(opts: MapperOptions) {
  return new MapperClass(opts);
}
