# ruleforge

A declarative rule-based engine to map heterogeneous JSON/XML payloads into a canonical nested JSON structure.

---

## ✨ Features

- JSON and XML support (XML normalized to JS object)
- Envelope / metadata support via `initializer`
- Payload inside string fields supported (JSON/XML strings)
- Preprocessors, PostProcessors
- Rule priority (top → bottom)
- Array selector (`X`) – first match
- Nested canonical output keys (dot-path targets)
- Transform functions (built-ins + custom)
- Debug metadata (`result.meta.matched`, `$pre`, etc.)

---

## 📦 Installation

```bash
npm install ruleforge
```

---

## 🚀 Basic Usage

```ts
import { createMapper } from "ruleforge";
import rules from "./rules.json" assert { type: "json" };

const mapper = createMapper({
  spec: rules,
  functions: {
    initializer: { initRequest },
    preprocessors: { getClientName, getSource },
    postProcessors: { normalizeCurrency },
    transforms: {
      /* custom transforms */
    },
  },
});

const result = await mapper.map(input, { requestId: "req-1" });

if (!result.ok) console.error(result.error);
else console.log(result.value);
```

---

## 🧠 Initializer (Envelope + payload string parsing)

```ts
async function initRequest(input: any) {
  // Example: { metadata: {...}, message: "<xml/>" } OR { metadata: {...}, jsonData: "{...}" }
  return {
    metadata: input.metadata,
    payload: input.message ?? input.jsonData ?? input.payload,
    payloadType: "auto",
  };
}
```

After initializer, the engine exposes namespaces:

- `$payload.*` (normalized payload object)
- `$meta.*` (metadata)
- `$pre.*` (preprocessor outputs)

Bare paths like `account.id` default to `$payload.account.id`.

---

## 🔍 Selectors (Array Matching)

Rule example:

```json
{
  "conditions": {
    "customers.X.name": "c2",
    "customers.X.value": "v2"
  },
  "mappings": ["customers.X.id"]
}
```

Engine:

- Iterates the `customers` array
- First matching element binds `X`
- Uses bound `X` during mapping

---

## 🔄 Built-in transforms

- trim
- upper
- lower
- toNumber
- toString
- toBoolean

---

## 🛠 Status

This repository currently includes:

- Full npm/TS scaffold (ESM-only)
- Typed spec interfaces
- Mapper pipeline skeleton
- Examples + test placeholders

Implementation of the rule engine will be completed next.

---

## License

MIT
