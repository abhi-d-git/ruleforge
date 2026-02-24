import { describe, it, expect } from "vitest";

// Adjust these imports to match your project
import { bindSelectorsV1 } from "../src/core/SelectorEngine";
import { resolveMappings } from "../src/core/RuleEngine"; // or wherever resolveMappings is exported
import type { Namespaces } from "../src/resolvers/PathResolver";
import type { RuleEntryV1 } from "../src/types/spec"; // wherever RuleEntryV1 lives

// ---- Minimal stubs (keep tests focused) ----
function makeTransforms() {
  return {
    apply(value: any, transformNames?: ReadonlyArray<string>, _ctx?: any) {
      if (!transformNames?.length) return value;

      let v = value;
      for (const t of transformNames) {
        if (t === "trim" && typeof v === "string") v = v.trim();
        else if (t === "upper" && typeof v === "string") v = v.toUpperCase();
      }
      return v;
    },
  };
}

function makeCtx(payload: any) {
  const ns: Namespaces = { payload, meta: {}, pre: {} };

  return {
    ns,
    resolveOpts: { allowBarePaths: true, aliases: {} },
  };
}

describe("q-token (?.) + $Xn selector binding", () => {
  it("works when Account is an ARRAY (UsageCollection.Account = [{...}])", () => {
    const payload = {
      UsageCollection: {
        Account: [
          { AccountID: "Account_1", name: "Account_Name_1" },
          { AccountID: "Account_2", name: "Account_Name_2" },
        ],
      },
    };

    const entry: RuleEntryV1 = {
      conditions: { "UsageCollection.Account.?.$X1.AccountID": "Account_1" },
      mappings: [
        {
          path: "UsageCollection.Account.?.$X1.name",
          transform: ["trim", "upper"],
        },
      ],
    };

    const ctx = makeCtx(payload);

    const sel = bindSelectorsV1(entry, ctx as any);
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;

    expect(sel.result.kind).toBe("bound");
    if (sel.result.kind !== "bound") return;

    const r = resolveMappings(
      entry.mappings,
      ctx.ns,
      ctx.resolveOpts,
      makeTransforms() as any,
      {} as any, // MapperContext, not used by our stub transforms
      sel.result.bindings,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.valueFound).toBe(true);
    expect(r.value).toBe("ACCOUNT_NAME_1");
  });

  it("works when Account is an OBJECT (UsageCollection.Account = {...})", () => {
    const payload = {
      UsageCollection: {
        Account: { AccountID: "Account_1", name: "Account_Name_1" },
      },
    };

    const entry: RuleEntryV1 = {
      conditions: { "UsageCollection.Account.?.$X1.AccountID": "Account_1" },
      mappings: [
        {
          path: "UsageCollection.Account.?.$X1.name",
          transform: ["trim", "upper"],
        },
      ],
    };

    const ctx = makeCtx(payload);

    const sel = bindSelectorsV1(entry, ctx as any);
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;

    expect(sel.result.kind).toBe("bound");
    if (sel.result.kind !== "bound") return;

    const r = resolveMappings(
      entry.mappings,
      ctx.ns,
      ctx.resolveOpts,
      makeTransforms() as any,
      {} as any,
      sel.result.bindings,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.valueFound).toBe(true);
    expect(r.value).toBe("ACCOUNT_NAME_1");
  });
});
