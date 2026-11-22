// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Rpc } from "@opencode/plugin/rpc"

export const ContextDiff = Rpc.define({
  id: "context-diff",
  events: {},
  methods: {
    report: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string", minLength: 1, maxLength: 128 } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
} as const)
