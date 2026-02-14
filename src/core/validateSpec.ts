import type { RuleDocumentV1 } from "../types/spec.js";

export function asRuleDocumentV1(spec: unknown): RuleDocumentV1 {
  if (!spec || typeof spec !== "object")
    throw new Error("Spec must be an object");

  const s = spec as any;
  if (s.version !== "1.0")
    throw new Error(`Unsupported spec version: ${String(s.version)}`);

  if (!s.rules || typeof s.rules !== "object")
    throw new Error("Spec.rules must be an object");

  return s as RuleDocumentV1;
}
