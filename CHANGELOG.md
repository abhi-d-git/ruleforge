# Changelog

## 0.1.0

- Initial Draft (ESM-only)

## 0.3.0

### 🚀 Major Enhancements

- DFS-based selector engine supporting $X1..$X10
- Multi-level nested selector support
- Operator-style condition evaluation
  - equalsIgnoreCase
  - inIgnoreCase
  - regex (with flags)
  - gt/gte/lt/lte
  - exists
  - type
  - contains / startsWith / endsWith (case-sensitive + insensitive)
  - combinators: all / any / not

### 🛡 Improvements

- Strict invalid operator detection
- Safer TypeScript typing
- Guardrails for selector depth and candidate count

## v0.3.1

### Added

- `?` path segment to normalize array-or-singleton XML structures
  - Works in mappings, conditions, and selector roots
  - Example: `UsageCollection.Account.?.name`

- `defaultValue` + `defaultWhen` in MappingObjV1
  - `defaultWhen: "missing" | "found" | "empty"`
