import type { PayloadType } from "./spec.js";
import type { NamespaceInput } from "./internal.js";

export type InitResult = {
  metadata?: unknown;
  payload?: unknown; // object OR string
  rawPayload?: string;
  payloadType?: PayloadType; // hint
  /** seed for $pre namespace (e.g., parsed CDATA, extracted message, etc.) */
  pre?: Record<string, any>;
};

export interface MapperContext {
  requestId?: string;
  [k: string]: unknown;
}

export type InitializerFn = (
  input: unknown,
  ctx: MapperContext,
) => Promise<InitResult> | InitResult;

export type PreprocessorFn = (
  ns: NamespaceInput,
  ctx: MapperContext,
) => Promise<unknown> | unknown;

export type PostProcessorFn = (
  out: unknown,
  ns: NamespaceInput,
  ctx: MapperContext,
) => Promise<unknown> | unknown;

export type TransformFn = (value: unknown, ctx: MapperContext) => unknown;

export interface FunctionRegistry {
  initializer?: Record<string, InitializerFn>;
  preprocessors?: Record<string, PreprocessorFn>;
  postProcessors?: Record<string, PostProcessorFn>;
  transforms?: Record<string, TransformFn>;
}
