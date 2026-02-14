export function detectInputType(input: unknown): "json" | "xml" {
  if (typeof input === "string") {
    const s = input.trim();
    if (s.startsWith("<") && s.endsWith(">")) return "xml";
  }
  return "json";
}
