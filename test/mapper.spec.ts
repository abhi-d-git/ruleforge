import { describe, it, expect } from "vitest";
import { createMapper } from "../src/index.js";

describe("scaffold", () => {
  it("creates mapper and returns NOT_IMPLEMENTED until engine is built", async () => {
    const mapper = createMapper({
      spec: { version: "1.0", rules: { "customer.id": [{ mappings: ["user.id"] }] } } as any
    });
    const res = await mapper.map({ user: { id: "u-1" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_IMPLEMENTED");
  });
});
