// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto"
import type { SessionContext } from "@opencode/plugin/promise/session"

export type ContextRequest = Pick<SessionContext, "system" | "tools"> & {
  agent: string
  model: { providerID: string; id: string; variant?: string }
}

const SESSION_LIMIT = 128
const ENTRY_LIMIT = 256
const DISPLAY_LIMIT = 12

function fingerprint(value: unknown) {
  const json = JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
  return createHash("sha256").update(json).digest("hex")
}

function snapshot(request: ContextRequest, checkpoint?: string) {
  const instructions = new Map<string, string>()
  let hasInstructionMetadata = false
  for (const part of request.system) {
    const experimental = part.metadata?.experimental as { instructions?: unknown } | undefined
    if (!Array.isArray(experimental?.instructions)) continue
    hasInstructionMetadata = true
    for (const item of experimental.instructions) {
      if (typeof item?.key === "string" && typeof item.text === "string") {
        instructions.set(item.key, fingerprint([instructions.get(item.key), item.text]))
      }
    }
  }
  const tools = Object.entries(request.tools).sort(([a], [b]) => a.localeCompare(b))
  return {
    agent: request.agent,
    model: `${request.model.providerID}/${request.model.id}${request.model.variant ? `#${request.model.variant}` : ""}`,
    system: fingerprint(request.system.map(part => part.text)),
    instructions: new Map([...instructions].sort(([a], [b]) => a.localeCompare(b)).slice(0, ENTRY_LIMIT)),
    hasInstructionMetadata,
    instructionsTruncated: instructions.size > ENTRY_LIMIT,
    tools: new Map(tools.slice(0, ENTRY_LIMIT).map(([name, definition]) => [name, fingerprint(definition)])),
    toolsTruncated: tools.length > ENTRY_LIMIT,
    checkpoint,
  }
}

export function makeContextDiff() {
  type Snapshot = ReturnType<typeof snapshot>
  const sessions = new Map<string, { before?: Snapshot; after: Snapshot }>()

  return {
    observe(id: string, request: ContextRequest, checkpoint?: string) {
      const after = snapshot(request, checkpoint)
      const before = sessions.get(id)?.after
      sessions.delete(id)
      sessions.set(id, { before, after })
      if (sessions.size > SESSION_LIMIT) sessions.delete(sessions.keys().next().value!)
    },
    invalidate(id: string) {
      sessions.delete(id)
    },
    report(id: string): string {
      const pair = sessions.get(id)
      if (!pair?.before) return "Context Diff needs two observed agent requests in this session."
      const { before, after } = pair
      const changes: string[] = []
      const notes: string[] = []
      if (before.model !== after.model) changes.push(`Model: ${before.model} → ${after.model}`)
      if (before.agent !== after.agent) changes.push(`Agent: ${before.agent} → ${after.agent}`)
      if (before.system !== after.system) changes.push("System text changed.")
      if (before.checkpoint !== after.checkpoint) changes.push("Visible compaction checkpoint changed.")
      const compare = (label: string, first: Map<string, string>, second: Map<string, string>) => {
        const added = [...second.keys()].filter(key => !first.has(key))
        const removed = [...first.keys()].filter(key => !second.has(key))
        const changed = [...second.keys()].filter(key => first.has(key) && first.get(key) !== second.get(key))
        for (const [verb, keys] of [["added", added], ["removed", removed], ["changed", changed]] as const) {
          if (keys.length) changes.push(`${label} ${verb}: ${keys.slice(0, DISPLAY_LIMIT).join(", ")}${keys.length > DISPLAY_LIMIT ? ` (+${keys.length - DISPLAY_LIMIT} more)` : ""}`)
        }
      }
      if (before.instructionsTruncated || after.instructionsTruncated) notes.push("Instruction source comparison omitted: too many sources.")
      else if (!before.hasInstructionMetadata || !after.hasInstructionMetadata) notes.push("Instruction source comparison unavailable: source metadata was missing from at least one request.")
      else compare("Instruction sources", before.instructions, after.instructions)
      if (before.toolsTruncated || after.toolsTruncated) notes.push("Tool comparison omitted: too many tool definitions.")
      else compare("Tools", before.tools, after.tools)
      return ["Previous vs. latest observed agent request", "", ...(changes.length ? changes : ["No changes detected in the compared fields."]), ...notes].join("\n")
    },
  }
}
