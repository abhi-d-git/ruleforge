// test/ConditionEvaluator.spec.ts
import { describe, it, expect } from "vitest";
import { matchesExpected } from "../src/core/ConditionEvaluator.js";

describe("ConditionEvaluator - operator style matching", () => {
  it("primitive equality (backward compatible)", () => {
    expect(matchesExpected("a", "a")).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected("a", "b")).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("array includes (backward compatible)", () => {
    expect(matchesExpected("x", ["a", "x", "z"])).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected("y", ["a", "x", "z"])).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("equalsIgnoreCase works", () => {
    expect(
      matchesExpected("Agent_1", { equalsIgnoreCase: "agent_1" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("AGENT_1", { equalsIgnoreCase: "agent_1" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected(123, { equalsIgnoreCase: "agent_1" })).toMatchObject(
      {
        ok: true,
        matched: false,
      },
    );
  });

  it("inIgnoreCase works", () => {
    expect(
      matchesExpected("Agent_1", { inIgnoreCase: ["agent_1", "agent_2"] }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("AGENT_2", { inIgnoreCase: ["agent_1", "agent_2"] }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("Agent_3", { inIgnoreCase: ["agent_1", "agent_2"] }),
    ).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("regex with flags works", () => {
    expect(
      matchesExpected("Agent_123", { regex: "^Agent_[0-9]+$", flags: "i" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("agent_99", { regex: "^Agent_[0-9]+$", flags: "i" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("Agent_X", { regex: "^Agent_[0-9]+$", flags: "i" }),
    ).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("invalid regex returns ok=false", () => {
    const r = matchesExpected("abc", { regex: "[" });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("numeric comparisons coerce numeric strings", () => {
    expect(matchesExpected("1500.50", { gt: 1000 })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected("999.9", { gte: 1000 })).toMatchObject({
      ok: true,
      matched: false,
    });

    // invalid numeric strings -> no match, no crash
    expect(matchesExpected("abc", { gt: 10 })).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("exists operator", () => {
    expect(matchesExpected("x", { exists: true })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected(undefined, { exists: true })).toMatchObject({
      ok: true,
      matched: false,
    });

    expect(matchesExpected(undefined, { exists: false })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected("x", { exists: false })).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("type operator", () => {
    expect(matchesExpected("x", { type: "string" })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected(1, { type: "number" })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected([], { type: "array" })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected(null, { type: "null" })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(matchesExpected({}, { type: "object" })).toMatchObject({
      ok: true,
      matched: true,
    });

    expect(matchesExpected({}, { type: "array" })).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("contains / startsWith / endsWith", () => {
    expect(matchesExpected("hello world", { contains: "world" })).toMatchObject(
      {
        ok: true,
        matched: true,
      },
    );
    expect(
      matchesExpected("hello world", { containsIgnoreCase: "WORLD" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });

    expect(matchesExpected("Agent_1", { startsWith: "Agent" })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("Agent_1", { startsWithIgnoreCase: "agent" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });

    expect(matchesExpected("Agent_1", { endsWith: "_1" })).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("Agent_1", { endsWithIgnoreCase: "_1" }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
  });

  it("combinators: all / any / not", () => {
    expect(
      matchesExpected("Agent_1", {
        all: [
          { equalsIgnoreCase: "agent_1" },
          { regex: "agent_[0-9]+", flags: "i" },
        ],
      }),
    ).toMatchObject({ ok: true, matched: true });

    expect(
      matchesExpected("Agent_2", {
        any: [{ equalsIgnoreCase: "agent_1" }, { equalsIgnoreCase: "agent_2" }],
      }),
    ).toMatchObject({ ok: true, matched: true });

    expect(
      matchesExpected("Agent_2", { not: { equalsIgnoreCase: "agent_3" } }),
    ).toMatchObject({
      ok: true,
      matched: true,
    });
    expect(
      matchesExpected("Agent_3", { not: { equalsIgnoreCase: "agent_3" } }),
    ).toMatchObject({
      ok: true,
      matched: false,
    });
  });

  it("invalid operator key returns ok=false", () => {
    const r = matchesExpected("Agent_1", { equalsIgnoreCas: "agent_1" } as any);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("mixed primitive + operator inside any", () => {
    expect(
      matchesExpected("Agent_1", {
        any: ["Agent_1", { equalsIgnoreCase: "agent_2" }],
      }),
    ).toMatchObject({ ok: true, matched: true });

    expect(
      matchesExpected("Agent_2", {
        any: ["Agent_1", { equalsIgnoreCase: "agent_2" }],
      }),
    ).toMatchObject({ ok: true, matched: true });

    expect(
      matchesExpected("Agent_3", {
        any: ["Agent_1", { equalsIgnoreCase: "agent_2" }],
      }),
    ).toMatchObject({ ok: true, matched: false });
  });
});
