import { createMapper } from "../../src/index.js";
import { asRuleDocumentV1 } from "../../src/core/validateSpec.js";
import rulesJson from "./rules.json" with { type: "json" };

const rules = asRuleDocumentV1(rulesJson);
const mapper = createMapper({ spec: rules });

const input = {
  customers: [
    { fleet: { id: "fleetId_0" }, devices: [{ id: "deviceId_1" }] },
    {
      fleet: { id: "fleetId_5" },
      devices: [
        { id: "x" },
        { id: "y" },
        { id: "deviceId_10", serialNum: 200 },
      ],
    },
  ],
};
const result = await mapper.map(input);

console.log(JSON.stringify(result, null, 2));
