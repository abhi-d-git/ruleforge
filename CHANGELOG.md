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
