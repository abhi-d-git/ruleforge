export type PayloadType = "json" | "xml" | "auto";

export interface RuleDocumentV1 {
  version: "1.0";
  name?: string;

  initializer?: FunctionRef;

  /** Aliases apply to PAYLOAD paths only. Key = logical root, value = list of candidate roots */
  aliases?: Record<string, ReadonlyArray<string>>;

  preprocessors?: Record<string, FunctionRef>;

  rules: Record<string, RuleEntryV1 | ReadonlyArray<RuleEntryV1>>;

  postProcessors?: ReadonlyArray<string>;
}

export type MappingV1 = string | MappingObjV1;

export interface RuleEntryV1 {
  conditions?: Record<string, unknown>;
  mappings: ReadonlyArray<MappingV1>;
  value?: unknown;
  required?: boolean;
}

export interface FunctionRef {
  function: string;
  options?: Record<string, unknown>;
}

export interface MappingObjV1 {
  path: string;
  transform?: ReadonlyArray<string>;
}

export interface RuleDocumentV1 {
  version: "1.0";
  name?: string;

  initializer?: FunctionRef;

  preprocessors?: Record<string, FunctionRef>;

  /** Canonical output keys are dot-paths (nested output) */
  rules: Record<string, RuleEntryV1 | ReadonlyArray<RuleEntryV1>>;

  postProcessors?: ReadonlyArray<string>;
}
