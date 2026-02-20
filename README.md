# ruleforge

Declarative Rule Engine & Integration Mapping Framework
Transform JSON/XML payloads into canonical nested JSON using selectors, conditions, transforms, and loop bindings.

---

# Why ruleforge?

RuleForge allows you to:

- Map complex nested payloads declaratively
- Handle JSON and XML seamlessly
- Extract deeply nested values using selector variables ($X1..$X10)
- Apply operator-based conditions
- Use preprocessors & postprocessors
- Normalize CDATA into $pre
- Support case-insensitive, regex, numeric comparisons
- Build enterprise-grade integration pipelines without hardcoding logic

---

## Features

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

## Installation

```bash
npm install ruleforge
```

---

<br/><br/>

# Core Concepts

## Namespaces

RuleForge works with three namespaces:

| Namespace | Description                   |
| --------- | ----------------------------- |
| $payload  | Original normalized payload   |
| $meta     | Input metadata                |
| $pre      | Preprocessed / derived values |

---

## Rule Document Structure

```
{
  "version": "1.0",
  "name": "example_rules",
  "initializer": { "function": "initRequest" },
  "aliases": {},
  "preprocessors": {},
  "postProcessors": [],
  "rules": {}
}

```

## Basic Example

**Input (JSON)**

```
{
  "device": {
    "serialNumber": "CNB1234567"
  }
}
```

**Rules**

```
{
  "version": "1.0",
  "rules": {
    "output.device.serialNumber": {
      "mappings": ["device.serialNumber"]
    }
  }
}
```

**Output**

```
{
  "output": {
    "device": {
      "serialNumber": "CNB1234567"
    }
  }
}
```

<br/>

### Selector Variables ($X1..$X10)

Supports nested array traversal.

Example:

```
{
  "match.serial": {
    "conditions": {
      "customers.$X1.devices.$X2.id": "deviceId_10"
    },
    "mappings": [
      "customers.$X1.devices.$X2.serialNum"
    ]
  }
}
```

✔ Automatically finds correct indices <br>
✔ DFS-based selector binding <br>
✔ Supports up to 10 nested variables

<br/>

### Looping Output Arrays ($X)

For output array construction:

```
"metrics.$X.totalSheets": {
  "conditions": {
    "CounterGroup.$X1.CounterName": "TotalSheets"
  },
  "mappings": [
    "CounterGroup.$X1.Value"
  ]
}
```

Each match produces:

```
{
  "metrics": [
    { "totalSheets": 17 },
    { "totalSheets": 18 }
  ]
}
```

<br/>

### Operator-Style Conditions

<br/>

**Case Insensitive**

```
{
  "$pre.clientName": { "equalsIgnoreCase": "agent_1" }
}
```

<br/>

**In List (Case Insensitive)**

```
{
  "$pre.clientName": { "inIgnoreCase": ["agent_1", "agent_2"] }
}
```

<br/>

**Regex**

```
{
  "$pre.clientName": { "regex": "^Agent_[0-9]+$", "flags": "i" }
}

```

<br/>

**Numeric Comparison**

```
{
  "account.balance": { "gt": 1000 }
}
```

<br/>

**Exists**

```
{
  "device.serialNumber": { "exists": true }
}
```

<br/>

**Type Check**

```
{
  "field": { "type": "string" }
}
```

<br/>

**Combinators**

```
{
  "$pre.clientName": {
    "all": [
      { "equalsIgnoreCase": "agent_1" },
      { "regex": "agent_[0-9]+", "flags": "i" }
    ]
  }
}
```

## Preprocessors

Preprocessors allow derived values before rules execute.

```
{
  "preprocessors": {
    "clientName": { "function": "getClientName" }
  }
}
```

Implementation:

```
async function getClientName(ns, ctx) {
  return ns.payload.source?.system;
}
```

Accessible as:

```
$pre.clientName
```

<br/>

## PostProcessors

Transform final output before returning:

```
{
  "postProcessors": ["convertOutputData"]
}
```

<br/>

## Aliases

Aliases allow fallback paths across payload types.

```
{
  "aliases": {
    "Asset": [
      "$pre.jsonData.device",
      "UsageCollection.Asset"
    ]
  }
}
```

Usage:

```
"Asset.serialNumber"
```

## Debug Mode

Enable debug to include:

- matched rule index
- selector bindings
- resolved paths
- $pre content

```
new Mapper({
spec,
functions,
debug: true
})
```

---

## API Usage

```
import { Mapper } from "ruleforge";

const mapper = new Mapper({
  spec: rules,
  functions: {
    initializer: { initRequest },
    preprocessors: { getClientName },
    transforms: {},
    postProcessors: {}
  }
});

const result = await mapper.map(input);

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

---

## Guardrails

- Max 10 selector variables ($X1..$X10)
- Max candidate bindings limited
- Max array scan per level limited
- Invalid operator detection
- Invalid selector detection
- Required rule enforcement

---

## Roadmap

- Expression engine (optional future)
- Plugin architecture (v0.3+)
- Performance optimizations
- JSON Schema validation for rule documents

---

## License

MIT

---

## Contributing

- PRs welcome.
- Open issues for feature discussions before major design changes.

---
