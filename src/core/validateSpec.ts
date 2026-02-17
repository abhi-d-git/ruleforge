import type { RuleDocumentV1 } from "../types/spec.js";

const RULE_ENTRY_ALLOWED_KEYS = new Set([
  "conditions",
  "mappings",
  "value",
  "required",
]);

export function asRuleDocumentV1(spec: unknown): RuleDocumentV1 {
  if (!spec || typeof spec !== "object")
    throw new Error("Spec must be an object");

  const s = spec as any;
  if (s.version !== "1.0")
    throw new Error(`Unsupported spec version: ${String(s.version)}`);

  if (!s.rules || typeof s.rules !== "object")
    throw new Error("Spec.rules must be an object");

  for (const [outKey, def] of Object.entries(s.rules ?? {})) {
    if (Array.isArray(def)) {
      def.forEach((entry, i) => {
        assertNoUnknownKeys(entry, `rules.${outKey}[${i}]`);
        // existing per-field validation continues...
      });
    } else {
      assertNoUnknownKeys(def, `rules.${outKey}`);
      // existing per-field validation continues...
    }
  }
  return s as RuleDocumentV1;
}

function assertNoUnknownKeys(obj: any, path: string) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

  const keys = Object.keys(obj);
  const unknown = keys.filter((k) => !RULE_ENTRY_ALLOWED_KEYS.has(k));

  if (unknown.length > 0) {
    const hints: string[] = [];
    if (unknown.includes("mapping")) hints.push(`Did you mean "mappings"?`);

    throw new Error(
      `Invalid RuleEntry at ${path}: unknown key(s): ${unknown
        .map((k) => `"${k}"`)
        .join(", ")}. Allowed keys: ${Array.from(RULE_ENTRY_ALLOWED_KEYS)
        .map((k) => `"${k}"`)
        .join(", ")}${hints.length ? `. ${hints.join(" ")}` : ""}`,
    );
  }
}
