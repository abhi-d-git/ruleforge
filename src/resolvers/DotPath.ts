export type DotPath = string;

export function splitPath(path: string): string[] {
  return path.split(".").filter(Boolean);
}
