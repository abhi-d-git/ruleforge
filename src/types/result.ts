import type { InputKind, MatchedInfo } from "./internal.js";

export type MapResult =
  | { ok: true; value: any; meta?: MapMeta; warnings?: MapWarning[] }
  | { ok: false; error: MapError; meta?: MapMeta; warnings?: MapWarning[] };

export interface MapMeta {
  inputType: InputKind;
  pre: Record<string, any>;
  matched: Record<string, MatchedInfo | undefined>;
}

export interface MapWarning {
  code: string;
  message: string;
  path?: string;
}

export interface MapError {
  code:
    | "INITIALIZER_ERROR"
    | "PAYLOAD_PARSE_ERROR"
    | "PREPROCESSOR_ERROR"
    | "MISSING_REQUIRED_FIELD"
    | "NO_RULE_MATCHED_REQUIRED"
    | "TRANSFORM_ERROR"
    | "INVALID_SELECTOR_ROOT"
    | "INVALID_LOOP_RULE"
    | "NOT_IMPLEMENTED";
  message: string;
  field?: string;
  details?: any;
}
