import { describe, it, expect } from "vitest";
import { resolvePath } from "../src/resolvers/PathResolver"; // adjust path
import type { Namespaces } from "../src/resolvers/PathResolver";

describe("resolvePath with q-token (?.)", () => {
  const opts = { allowBarePaths: true, aliases: {} };

  it("subelement.? returns array as-is", () => {
    const ns: Namespaces = {
      payload: { subelement: [{ x: 1 }, { x: 2 }] },
      meta: {},
      pre: {},
    };
    const r = resolvePath(ns, "subelement.?", opts as any);
    expect(Array.isArray(r.value)).toBe(true);
    expect(r.value.length).toBe(2);
  });

  it("subelement.? wraps singleton object into array", () => {
    const ns: Namespaces = {
      payload: { subelement: { x: 1 } },
      meta: {},
      pre: {},
    };
    const r = resolvePath(ns, "subelement.?", opts as any);
    expect(Array.isArray(r.value)).toBe(true);
    expect(r.value.length).toBe(1);
    expect(r.value[0].x).toBe(1);
  });

  it("subelement.?.0.x works for singleton object", () => {
    const ns: Namespaces = {
      payload: { subelement: { x: 42 } },
      meta: {},
      pre: {},
    };
    const r = resolvePath(ns, "subelement.?.0.x", opts as any);
    expect(r.value).toBe(42);
  });
});
