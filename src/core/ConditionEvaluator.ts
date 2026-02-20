// src/core/ConditionEvaluator.ts

export type Primitive = string | number | boolean | null;

export type ConditionValue = Primitive | ReadonlyArray<Primitive> | ConditionOp;

export type ConditionMap = Record<string, ConditionValue>;

export type TypeName =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "null";
/**
 * Operator-style condition object.
 * Exactly one of these operator fields may be used (except combinators which can nest).
 */
export type ConditionOp =
  | { eq: Primitive }
  | { ne: Primitive }
  | { equalsIgnoreCase: string }
  | { in: ReadonlyArray<Primitive> }
  | { nin: ReadonlyArray<Primitive> }
  | { inIgnoreCase: ReadonlyArray<string> }
  | { exists: boolean }
  | { type: TypeName }
  | { contains: string }
  | { containsIgnoreCase: string }
  | { startsWith: string }
  | { startsWithIgnoreCase: string }
  | { endsWith: string }
  | { endsWithIgnoreCase: string }
  | { regex: string; flags?: string }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { all: ReadonlyArray<unknown> }
  | { any: ReadonlyArray<unknown> }
  | { not: unknown };

export interface ConditionEvalResult {
  ok: boolean;
  /** false if condition did not match */
  matched?: boolean;
  /** present when ok=false (invalid operator schema, regex error, etc.) */
  error?: string;
  details?: any;
}

const OP_KEYS = new Set([
  "eq",
  "ne",
  "equalsIgnoreCase",
  "in",
  "nin",
  "inIgnoreCase",
  "exists",
  "type",
  "contains",
  "containsIgnoreCase",
  "startsWith",
  "startsWithIgnoreCase",
  "endsWith",
  "endsWithIgnoreCase",
  "regex",
  "flags",
  "gt",
  "gte",
  "lt",
  "lte",
  "all",
  "any",
  "not",
]);

/**
 * Main entry: evaluate actual value against expected (primitive / array-in / operator object).
 * - Backward compatible with your old behavior:
 *   - expected primitive => ===
 *   - expected array => includes(actual)
 */
export function matchesExpected(
  actual: any,
  expected: unknown,
): ConditionEvalResult {
  try {
    // Operator object
    if (isPlainObject(expected)) {
      return evalOp(actual, expected as any);
    }

    // Array => "in" semantics (backward compatible)
    if (Array.isArray(expected)) {
      return { ok: true, matched: (expected as any[]).includes(actual) };
    }

    // Primitive => strict equals (backward compatible)
    return { ok: true, matched: actual === expected };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Optional helper if you want to validate condition objects during spec validation.
 * Returns ok=false if operator object is malformed (unknown keys, multiple ops, wrong types).
 */
export function validateConditionValue(
  expected: ConditionValue,
): ConditionEvalResult {
  try {
    if (isPlainObject(expected)) {
      return validateOp(expected as any);
    }
    if (Array.isArray(expected)) {
      // arrays must contain primitives
      for (const v of expected) {
        if (!isPrimitive(v)) {
          return {
            ok: false,
            error:
              "Invalid condition array: elements must be primitive (string/number/boolean/null).",
            details: { value: v },
          };
        }
      }
      return { ok: true, matched: true };
    }
    if (!isPrimitive(expected)) {
      return {
        ok: false,
        error: "Invalid condition value type.",
        details: { expected },
      };
    }
    return { ok: true, matched: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ----------------------
// Operator evaluation
// ----------------------

function evalOp(actual: any, op: Record<string, any>): ConditionEvalResult {
  const v = validateOp(op);
  if (!v.ok) return v;

  // Combinators
  if ("all" in op) {
    const arr = op.all as ReadonlyArray<ConditionValue>;
    for (const sub of arr) {
      const r = matchesExpected(actual, sub);
      if (!r.ok) return r;
      if (!r.matched) return { ok: true, matched: false };
    }
    return { ok: true, matched: true };
  }

  if ("any" in op) {
    const arr = op.any as ReadonlyArray<ConditionValue>;
    for (const sub of arr) {
      const r = matchesExpected(actual, sub);
      if (!r.ok) return r;
      if (r.matched) return { ok: true, matched: true };
    }
    return { ok: true, matched: false };
  }

  if ("not" in op) {
    const r = matchesExpected(actual, op.not as ConditionValue);
    if (!r.ok) return r;
    return { ok: true, matched: !r.matched };
  }

  // Basic ops
  if ("exists" in op) {
    const want = !!op.exists;
    const exists = actual !== undefined;
    return { ok: true, matched: want ? exists : !exists };
  }

  if ("type" in op) {
    return { ok: true, matched: matchType(actual, op.type) };
  }

  if ("eq" in op) return { ok: true, matched: actual === op.eq };
  if ("ne" in op) return { ok: true, matched: actual !== op.ne };

  if ("equalsIgnoreCase" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    return {
      ok: true,
      matched:
        actual.toLowerCase() === String(op.equalsIgnoreCase).toLowerCase(),
    };
  }

  if ("in" in op) {
    const arr = op.in as any[];
    return { ok: true, matched: arr.includes(actual) };
  }

  if ("nin" in op) {
    const arr = op.nin as any[];
    return { ok: true, matched: !arr.includes(actual) };
  }

  if ("inIgnoreCase" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    const lower = actual.toLowerCase();
    const arr = op.inIgnoreCase as any[];
    return {
      ok: true,
      matched: arr.some(
        (x) => typeof x === "string" && x.toLowerCase() === lower,
      ),
    };
  }

  if ("contains" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    return { ok: true, matched: actual.includes(String(op.contains)) };
  }

  if ("containsIgnoreCase" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    return {
      ok: true,
      matched: actual
        .toLowerCase()
        .includes(String(op.containsIgnoreCase).toLowerCase()),
    };
  }

  if ("startsWith" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    return { ok: true, matched: actual.startsWith(String(op.startsWith)) };
  }

  if ("startsWithIgnoreCase" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    const a = actual.toLowerCase();
    const b = String(op.startsWithIgnoreCase).toLowerCase();
    return { ok: true, matched: a.startsWith(b) };
  }

  if ("endsWith" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    return { ok: true, matched: actual.endsWith(String(op.endsWith)) };
  }

  if ("endsWithIgnoreCase" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    const a = actual.toLowerCase();
    const b = String(op.endsWithIgnoreCase).toLowerCase();
    return { ok: true, matched: a.endsWith(b) };
  }

  if ("regex" in op) {
    if (typeof actual !== "string") return { ok: true, matched: false };
    const pattern = String(op.regex);
    const flags = op.flags ? String(op.flags) : undefined;
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (e: any) {
      return {
        ok: false,
        error: `Invalid regex: ${e?.message ?? String(e)}`,
        details: { pattern, flags },
      };
    }
    return { ok: true, matched: re.test(actual) };
  }

  // Numeric comparisons: if actual is string numeric, allow coercion safely
  if ("gt" in op || "gte" in op || "lt" in op || "lte" in op) {
    const n = toNumber(actual);
    if (n == null) return { ok: true, matched: false };

    if ("gt" in op) return { ok: true, matched: n > Number(op.gt) };
    if ("gte" in op) return { ok: true, matched: n >= Number(op.gte) };
    if ("lt" in op) return { ok: true, matched: n < Number(op.lt) };
    if ("lte" in op) return { ok: true, matched: n <= Number(op.lte) };
  }

  // Should never happen due to validation
  return { ok: false, error: "Unknown operator." };
}

function validateOp(op: Record<string, any>): ConditionEvalResult {
  // Unknown keys check (allow "flags" only when regex)
  for (const k of Object.keys(op)) {
    if (!OP_KEYS.has(k)) {
      return {
        ok: false,
        error: `Unknown condition operator key: '${k}'`,
        details: { op },
      };
    }
  }

  // Count operator keys (excluding "flags" which is auxiliary)
  const keys = Object.keys(op).filter((k) => k !== "flags");
  if (keys.length === 0) {
    return {
      ok: false,
      error: "Empty condition operator object is not allowed.",
      details: { op },
    };
  }

  // Combinators can co-exist only with their own fields
  if ("all" in op) {
    if (keys.length !== 1)
      return {
        ok: false,
        error: "Operator 'all' cannot be combined with other operators.",
        details: { op },
      };
    if (!Array.isArray(op.all))
      return { ok: false, error: "'all' must be an array.", details: { op } };
    return { ok: true, matched: true };
  }

  if ("any" in op) {
    if (keys.length !== 1)
      return {
        ok: false,
        error: "Operator 'any' cannot be combined with other operators.",
        details: { op },
      };
    if (!Array.isArray(op.any))
      return { ok: false, error: "'any' must be an array.", details: { op } };
    return { ok: true, matched: true };
  }

  if ("not" in op) {
    if (keys.length !== 1)
      return {
        ok: false,
        error: "Operator 'not' cannot be combined with other operators.",
        details: { op },
      };
    return { ok: true, matched: true };
  }

  // Single-operator rule (most ops)
  if (
    keys.length !== 1 &&
    !(keys.length === 2 && "regex" in op && "flags" in op)
  ) {
    return {
      ok: false,
      error:
        "Condition operator object must contain exactly one operator (except regex+flags).",
      details: { op },
    };
  }

  // Type validations
  if ("equalsIgnoreCase" in op && typeof op.equalsIgnoreCase !== "string") {
    return {
      ok: false,
      error: "'equalsIgnoreCase' must be a string.",
      details: { op },
    };
  }

  if ("inIgnoreCase" in op) {
    if (
      !Array.isArray(op.inIgnoreCase) ||
      op.inIgnoreCase.some((x: any) => typeof x !== "string")
    ) {
      return {
        ok: false,
        error: "'inIgnoreCase' must be an array of strings.",
        details: { op },
      };
    }
  }

  if ("in" in op) {
    if (!Array.isArray(op.in) || op.in.some((x: any) => !isPrimitive(x))) {
      return {
        ok: false,
        error: "'in' must be an array of primitive values.",
        details: { op },
      };
    }
  }

  if ("nin" in op) {
    if (!Array.isArray(op.nin) || op.nin.some((x: any) => !isPrimitive(x))) {
      return {
        ok: false,
        error: "'nin' must be an array of primitive values.",
        details: { op },
      };
    }
  }

  if ("contains" in op && typeof op.contains !== "string") {
    return {
      ok: false,
      error: "'contains' must be a string.",
      details: { op },
    };
  }

  if ("containsIgnoreCase" in op && typeof op.containsIgnoreCase !== "string") {
    return {
      ok: false,
      error: "'containsIgnoreCase' must be a string.",
      details: { op },
    };
  }

  if ("startsWith" in op && typeof op.startsWith !== "string") {
    return {
      ok: false,
      error: "'startsWith' must be a string.",
      details: { op },
    };
  }

  if (
    "startsWithIgnoreCase" in op &&
    typeof op.startsWithIgnoreCase !== "string"
  ) {
    return {
      ok: false,
      error: "'startsWithIgnoreCase' must be a string.",
      details: { op },
    };
  }

  if ("endsWith" in op && typeof op.endsWith !== "string") {
    return {
      ok: false,
      error: "'endsWith' must be a string.",
      details: { op },
    };
  }

  if ("endsWithIgnoreCase" in op && typeof op.endsWithIgnoreCase !== "string") {
    return {
      ok: false,
      error: "'endsWithIgnoreCase' must be a string.",
      details: { op },
    };
  }

  if ("regex" in op && typeof op.regex !== "string") {
    return { ok: false, error: "'regex' must be a string.", details: { op } };
  }

  if ("flags" in op && !("regex" in op)) {
    return {
      ok: false,
      error: "'flags' is only allowed with 'regex'.",
      details: { op },
    };
  }

  for (const k of ["gt", "gte", "lt", "lte"] as const) {
    if (k in op && typeof op[k] !== "number") {
      return { ok: false, error: `'${k}' must be a number.`, details: { op } };
    }
  }

  if ("type" in op) {
    const t = op.type;
    const allowed = ["string", "number", "boolean", "array", "object", "null"];
    if (!allowed.includes(t)) {
      return {
        ok: false,
        error: `'type' must be one of ${allowed.join(", ")}.`,
        details: { op },
      };
    }
  }

  if ("exists" in op && typeof op.exists !== "boolean") {
    return { ok: false, error: "'exists' must be boolean.", details: { op } };
  }

  if ("eq" in op && !isPrimitive(op.eq)) {
    return {
      ok: false,
      error: "'eq' must be a primitive value.",
      details: { op },
    };
  }

  if ("ne" in op && !isPrimitive(op.ne)) {
    return {
      ok: false,
      error: "'ne' must be a primitive value.",
      details: { op },
    };
  }

  return { ok: true, matched: true };
}

// ----------------------
// Helpers
// ----------------------

function isPlainObject(v: any): v is Record<string, any> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function isPrimitive(v: any): v is Primitive {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function matchType(actual: any, t: TypeName): boolean {
  if (t === "null") return actual === null;
  if (t === "array") return Array.isArray(actual);
  if (t === "object")
    return (
      actual != null && typeof actual === "object" && !Array.isArray(actual)
    );
  return typeof actual === t;
}

function toNumber(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
