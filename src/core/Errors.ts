import type { MapError } from "../types/result.js";

export function err(code: MapError["code"], message: string, details?: any, field?: string): MapError {
  return { code, message, details, field };
}
