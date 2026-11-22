// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Rpc } from "@opencode/plugin/rpc"
import { TEXT_LIMIT } from "./audit.ts"

const sessionID = { type: "string", minLength: 1, maxLength: 128 } as const
const sessionInput = { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false } as const
const output = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
} as const

export const CompactionAudit = Rpc.define({
  id: "compaction-audit",
  events: {},
  methods: {
    exportPreview: {
      input: sessionInput,
      output: {
        ...output,
        properties: { ...output.properties, path: { type: "string" }, revision: { type: "string" } },
      },
    },
    exportSave: {
      input: {
        ...sessionInput,
        properties: { sessionID, revision: { type: "string", minLength: 64, maxLength: 64 } },
        required: ["sessionID", "revision"],
      },
      output: { ...output, properties: { ...output.properties, saved: { type: "boolean" } }, required: ["text", "saved"] },
    },
    receipt: { input: sessionInput, output },
    track: {
      input: {
        type: "object",
        properties: { sessionID, text: { type: "string", minLength: 1, maxLength: TEXT_LIMIT } },
        required: ["sessionID", "text"],
        additionalProperties: false,
      },
      output,
    },
  },
} as const)

export function responseText(value: unknown): string {
  if (value && typeof value === "object" && "text" in value && typeof value.text === "string") return value.text
  throw new Error("Unexpected Compaction Audit response.")
}
