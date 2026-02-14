import { createMapper } from "./index.js";

const spec = {
  version: "1.0",
  rules: {
    "match.customerDevice": [
      {
        conditions: {
          "customers.$X1.fleet.id": "fleetId_5",
          "customers.$X1.devices.$X2.id": "deviceId_10",
        },
        mappings: ["customers.$X1.devices.$X2.serialNum"],
        required: true,
      },
    ],
  },
} as const;

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

const res = await createMapper({ spec }).map(input);
// console.log(JSON.stringify(res));
