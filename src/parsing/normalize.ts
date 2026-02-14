import { detectInputType } from "./detect.js";
import { parseXmlToObject } from "./xml.js";

export async function normalizePayload(payload: unknown, typeHint: "json" | "xml" | "auto" = "auto") {
  const kind = typeHint === "auto" ? detectInputType(payload) : typeHint;

  if (kind === "json") {
    if (typeof payload === "string") {
      // JSON string
      return { kind, obj: JSON.parse(payload) };
    }
    return { kind, obj: payload };
  }

  // xml
  if (typeof payload !== "string") {
    throw new Error("XML payload must be a string in v1");
  }
  const obj = parseXmlToObject(payload);
  return { kind, obj };
}
