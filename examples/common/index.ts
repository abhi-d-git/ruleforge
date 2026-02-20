import { createMapper } from "../../src/index.js";
import { asRuleDocumentV1 } from "../../src/core/validateSpec.js";
import rulesJson from "./rules.json" with { type: "json" };
import fs from "fs";
import { normalizePayload } from "../../src/parsing/normalize.js";

import type { MapperContext } from "../../src/types/functions.js";

const rules = asRuleDocumentV1(rulesJson);

const xmlPayload = fs.readFileSync(
  "./dist-example/examples/common/payloads/XMLPayload.xml",
  "utf-8",
);
const jsonPayload = fs.readFileSync(
  "./dist-example/examples/common/payloads/JSONPayload.json",
  "utf-8",
);

async function initRequest(input: any, ctx: MapperContext) {
  let input_data: any = {};
  const pre: any = {};

  if (ctx.type === "xml") {
    input_data = await processXMLayload(input, ctx);
  } else {
    input_data = await processJSONPayload(input, ctx);
  }

  return input_data;
}

async function getSourceSystem(
  ns: { payload: any; meta: any; pre: Record<string, any> },
  ctx: MapperContext,
) {
  return ctx.agentName;
}

async function getProtocolName(
  ns: { payload: any; meta: any; pre: Record<string, any> },
  ctx: MapperContext,
) {
  return ctx.protocol;
}

async function onlyForLogging(
  ns: { payload: any; meta: any; pre: Record<string, any> },
  ctx: MapperContext,
) {
  return ctx.protocol;
}

async function convertOutputData(
  out: unknown,
  ns: { payload: any; meta: any; pre: Record<string, any> },
  ctx: MapperContext,
) {
  // Do some post processing on the transformed data here !!!
  return out;
}

async function processJSONPayload(input: any, ctx: MapperContext) {
  const pre: Record<string, any> = {};

  const metadata = normalizePayload(input.metadata);

  // normalize outer json
  const outer = await normalizePayload(input);

  // Remember your actual payload is the parsed input and is present in outer.obj
  const payload = outer.obj;

  // lets normalize any json string that can be present

  // message
  const messageRaw = outer.obj?.message;
  if (typeof messageRaw === "string") {
    try {
      const inner = await normalizePayload(messageRaw);
      pre.message = inner.obj;
    } catch {
      // ignore, leave unset
    }
  }

  // jsonData
  const jsonDataRaw = outer.obj?.jsonData;
  if (typeof jsonDataRaw === "string") {
    try {
      const inner = await normalizePayload(jsonDataRaw);
      pre.jsonData = inner.obj;
    } catch {
      // ignore, leave unset
    }
  }

  return {
    metadata: metadata,
    payload: payload,
    payloadType: "auto" as const,
    pre,
  };
}

async function processXMLayload(input: any, ctx: MapperContext) {
  const pre: Record<string, any> = {};

  // normalize outer xml
  const outer = await normalizePayload(input);
  const payload = outer.obj;

  // CDATA parsing
  const deviceSuppliesRaw =
    outer.obj?.UsageCollection?.Asset?.Result?.WsUsage?.DeviceSupplies;
  if (typeof deviceSuppliesRaw === "string") {
    try {
      const inner = await normalizePayload(deviceSuppliesRaw);
      pre.deviceSupplies = inner.obj;
    } catch {
      // ignore, leave unset
    }
  }

  return {
    metadata: input.metadata,
    payload: payload,
    payloadType: "auto" as const,
    pre,
  };
}

async function startProcessing(input: any, ctx: MapperContext) {
  const mapper = createMapper({
    spec: rules,
    debug: false,
    functions: {
      initializer: { initRequest },
      preprocessors: { getSourceSystem, getProtocolName, onlyForLogging },
      postProcessors: { convertOutputData },
    },
  });

  const payload = ctx.type === "xml" ? xmlPayload : jsonPayload;

  const result = await mapper.map(payload, ctx);
  console.log(JSON.stringify(result));
  return result;
}

const ctx: MapperContext = {
  protocol: "Proto_X",
  agentName: "Agent_1",
};

const args = process.argv.slice(2); // removes node + script path
const fileType = args[0];
ctx.type = fileType;
const result: any = await startProcessing(xmlPayload, ctx);
