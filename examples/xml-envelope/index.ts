import { createMapper } from "../../src/index.js";
import { asRuleDocumentV1 } from "../../src/core/validateSpec.js";
import rulesJson from "./rules.json" with { type: "json" };
import fs from "fs";
import { normalizePayload } from "../../src/parsing/normalize.js";

const xmlPayload = fs.readFileSync("./XMLPayload.xml", "utf-8");

const rules = asRuleDocumentV1(rulesJson);

async function initRequest(input: any) {
  // normalize outer xml
  const outer = await normalizePayload(input, "xml");

  const pre: Record<string, any> = {};

  const deviceSuppliesRaw =
    outer.obj?.UsageCollection?.Asset?.Result?.WsUsage?.DeviceSupplies;

  if (
    typeof deviceSuppliesRaw === "string" &&
    deviceSuppliesRaw.trim().startsWith("<")
  ) {
    try {
      const inner = await normalizePayload(deviceSuppliesRaw, "xml");
      pre.DeviceSupplies = inner.obj; // ✅ store parsed CDATA here
    } catch {
      // ignore, leave unset
    }
  }

  const deviceUsageRaw =
    outer.obj?.UsageCollection?.Asset?.Result?.WsUsage?.DeviceUsage;
  if (
    typeof deviceUsageRaw === "string" &&
    deviceUsageRaw.trim().startsWith("<")
  ) {
    try {
      const inner = await normalizePayload(deviceUsageRaw, "xml");
      pre.DeviceUsage = inner.obj; // ✅ store parsed CDATA here
    } catch {
      // ignore, leave unset
    }
  }

  const deviceInformationRaw =
    outer.obj?.UsageCollection?.Asset?.Result?.WsUsage?.DeviceInformation;
  if (
    typeof deviceInformationRaw === "string" &&
    deviceInformationRaw.trim().startsWith("<")
  ) {
    try {
      const inner = await normalizePayload(deviceInformationRaw, "xml");
      pre.deviceInformation = inner.obj; // ✅ store parsed CDATA here
    } catch {
      // ignore, leave unset
    }
  }

  const deviceIdentificationRaw =
    outer.obj?.UsageCollection?.Asset?.Result?.WsUsage?.DeviceIdentification;
  if (
    typeof deviceIdentificationRaw === "string" &&
    deviceIdentificationRaw.trim().startsWith("<")
  ) {
    try {
      const inner = await normalizePayload(deviceIdentificationRaw, "xml");
      pre.deviceIdentification = inner.obj; // ✅ store parsed CDATA here
    } catch {
      // ignore, leave unset
    }
  }

  // if multiple CDATAs exist, parse them all into `pre.*`

  return {
    metadata: input.metadata,
    payload: xmlPayload,
    payloadType: "auto" as const,
    pre,
  };
}

const mapper = createMapper({
  spec: rules,
  functions: { initializer: { initRequest } },
});

// const input = {
//   metadata: { source: "serviceA" },
//   message: `<order><user id="SA-12345"><name>John</name></user></order>`,
// };

// console.log(xmlPayload);
const result = await mapper.map(xmlPayload);
console.log(JSON.stringify(result));
