// test/ConditionsMatch.e2e.spec.ts
import { describe, it, expect } from "vitest";
import { resolvePath, type Namespaces } from "../src/resolvers/PathResolver.js";
import {
  bindSelectorsAllV1,
  applyBindingsToPath,
  type SelectorBindings,
} from "../src/core/SelectorEngine.js";
import { matchesExpected } from "../src/core/ConditionEvaluator.js";

// Minimal helper mirroring your RunEngine/SelectorEngine condition evaluation
function conditionsMatchE2E(
  entry: { conditions?: Record<string, any> },
  ns: Namespaces,
  resolveOpts: {
    allowBarePaths: boolean;
    aliases?: Record<string, ReadonlyArray<string>>;
  },
  bindings?: SelectorBindings,
): { ok: boolean; matched: boolean; error?: string } {
  const cond = entry.conditions ?? {};
  for (const k of Object.keys(cond)) {
    const expected = cond[k];
    const kk = bindings ? applyBindingsToPath(k, bindings) : k;

    // If unresolved selector tokens remain, treat as no match
    if (/\.\$X\d+(\.|$)/.test(kk) || /^\$X\d+(\.|$)/.test(kk))
      return { ok: true, matched: false };

    const r = resolvePath(ns, kk, resolveOpts);
    const m = matchesExpected(r.value, expected);
    if (!m.ok) return { ok: false, matched: false, error: m.error };
    if (!m.matched) return { ok: true, matched: false };
  }
  return { ok: true, matched: true };
}

describe("conditionsMatch E2E (PathResolver + SelectorEngine + ConditionEvaluator)", () => {
  it("matches plain conditions without selectors", () => {
    const ns: Namespaces = {
      payload: { a: { b: "Hello" } },
      meta: {},
      pre: { clientName: "Agent_1" },
    };

    const entry = {
      conditions: {
        "a.b": "Hello",
        "$pre.clientName": { equalsIgnoreCase: "agent_1" },
      },
    };

    const res = conditionsMatchE2E(entry, ns, { allowBarePaths: true });
    expect(res).toEqual({ ok: true, matched: true });
  });

  it("rejects invalid operator schema (propagates error)", () => {
    const ns: Namespaces = {
      payload: { a: { b: "Hello" } },
      meta: {},
      pre: { clientName: "Agent_1" },
    };

    const entry = {
      conditions: {
        "$pre.clientName": { equalsIgnoreCas: "agent_1" }, // typo operator key
      },
    };

    const res = conditionsMatchE2E(entry, ns, { allowBarePaths: true });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("$X1/$X2 binding with nested arrays (first match yields bindings that satisfy all conditions)", () => {
    const payload = {
      customers: [
        {
          fleet: { id: "fleetId_0" },
          devices: [{ id: "deviceId_1", serialNum: 100 }],
        },
        {
          fleet: { id: "fleetId_5" },
          devices: [
            { id: "x", serialNum: 101 },
            { id: "y", serialNum: 102 },
            { id: "deviceId_10", serialNum: 200 },
          ],
        },
      ],
    };

    const ns: Namespaces = { payload, meta: {}, pre: {} };

    const entry = {
      conditions: {
        "customers.$X1.fleet.id": { inIgnoreCase: ["fleetid_5", "fleetid_1"] },
        "customers.$X1.devices.$X2.id": "deviceId_10",
      },
    };

    const sel = bindSelectorsAllV1(entry as any, {
      ns,
      resolveOpts: { allowBarePaths: true },
    });
    expect(sel.ok).toBe(true);
    if (!sel.ok) throw sel.error; // ✅ TS narrowing
    expect(sel.result.kind).toBe("boundMany");

    if (sel.result.kind === "boundMany") {
      const found = sel.result.bindings.some(
        (b) => b["$X1"] === 1 && b["$X2"] === 2,
      );
      expect(found).toBe(true);

      const b = sel.result.bindings.find(
        (x) => x["$X1"] === 1 && x["$X2"] === 2,
      )!;
      const cm = conditionsMatchE2E(entry, ns, { allowBarePaths: true }, b);
      expect(cm).toEqual({ ok: true, matched: true });

      const mappedPath = applyBindingsToPath(
        "customers.$X1.devices.$X2.serialNum",
        b,
      );
      const rr = resolvePath(ns, mappedPath, { allowBarePaths: true });
      expect(rr.value).toBe(200);
    }
  });

  it("alias fallback + namespace ($pre) in mappings: resolves $pre first, then payload", () => {
    const ns: Namespaces = {
      payload: {
        UsageCollection: {
          Asset: { AssetSerialNumber: "XML_SN_1" },
        },
      },
      meta: {},
      pre: {
        jsonData: { device: { serialNumber: "JSON_SN_1" } },
      },
    };

    const resolveOpts = {
      allowBarePaths: true,
      aliases: {
        Asset: ["$pre.jsonData.device", "UsageCollection.Asset"],
      },
    };

    const r1 = resolvePath(
      ns,
      "$pre.jsonData.device.serialNumber",
      resolveOpts,
    );
    expect(r1.value).toBe("JSON_SN_1");

    const r2 = resolvePath(
      ns,
      "UsageCollection.Asset.AssetSerialNumber",
      resolveOpts,
    );
    expect(r2.value).toBe("XML_SN_1");
  });

  it("three-level selector ($X1/$X2/$X3) happy-path example", () => {
    const payload = {
      DeviceUsagePrinterSubunit: {
        CounterGroup: [
          {
            CounterGroupName: "SheetsByMediaOutputID",
            CounterGroup: [
              {
                MediaOutputID: "Face-down",
                Counter: [
                  {
                    CounterName: "FaceDownSheets",
                    FixedPointNumber: { Significand: 17, Exponent: 0 },
                  },
                  {
                    CounterName: "TotalSheets",
                    FixedPointNumber: { Significand: 17, Exponent: 0 },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const ns: Namespaces = { payload, meta: {}, pre: {} };

    const entry = {
      conditions: {
        "DeviceUsagePrinterSubunit.CounterGroup.$X1.CounterGroupName":
          "SheetsByMediaOutputID",
        "DeviceUsagePrinterSubunit.CounterGroup.$X1.CounterGroup.$X2.Counter.$X3.CounterName":
          "TotalSheets",
      },
    };

    const sel = bindSelectorsAllV1(entry as any, {
      ns,
      resolveOpts: { allowBarePaths: true },
    });
    expect(sel.ok).toBe(true);
    if (!sel.ok) throw sel.error; // ✅ TS narrowing
    expect(sel.result.kind).toBe("boundMany");

    if (sel.result.kind === "boundMany") {
      expect(sel.result.bindings.length > 0).toBe(true);

      const okBinding = sel.result.bindings.find((b) => {
        const p = applyBindingsToPath(
          "DeviceUsagePrinterSubunit.CounterGroup.$X1.CounterGroup.$X2.Counter.$X3.FixedPointNumber.Significand",
          b,
        );
        const rr = resolvePath(ns, p, { allowBarePaths: true });
        return rr.value === 17;
      });

      expect(okBinding).toBeTruthy();

      const cm = conditionsMatchE2E(
        entry,
        ns,
        { allowBarePaths: true },
        okBinding!,
      );
      expect(cm).toEqual({ ok: true, matched: true });
    }
  });
});
