import assert from "node:assert/strict"
import { test } from "node:test"
import { makeContextDiff, type ContextRequest } from "../src/context-diff.ts"

function request(text: string, tools: ContextRequest["tools"], model = "previous"): ContextRequest {
  return {
    agent: "build", model: { providerID: "test", id: model }, tools,
    system: [{ type: "text", text, metadata: { experimental: { instructions: [{ key: "rules", text }] } } }],
  }
}

test("reports changes without exposing instructions, tool definitions or checkpoint IDs", () => {
  const diff = makeContextDiff()
  diff.observe("a", request("private first", { read: { description: "private tool", input: {} }, glob: { description: "", input: {} } }))
  assert.match(diff.report("a"), /needs two/)
  diff.observe("a", request("private second", { read: { description: "private change", input: {} }, grep: { description: "", input: {} } }, "current"), "private checkpoint")
  const report = diff.report("a")
  assert.match(report, /Model: test\/previous → test\/current/)
  assert.match(report, /Instruction sources changed: rules/)
  assert.match(report, /Tools added: grep/)
  assert.match(report, /Tools removed: glob/)
  assert.match(report, /Tools changed: read/)
  assert.match(report, /Visible compaction checkpoint changed/)
  assert.doesNotMatch(report, /private/)
  assert.match(diff.report("b"), /needs two/)
})

test("ignores reordered schema keys and resets the baseline after a failed observation", () => {
  const diff = makeContextDiff()
  diff.observe("a", request("unchanged", { read: { description: "", input: { type: "object", additionalProperties: false } } }))
  diff.observe("a", request("unchanged", { read: { description: "", input: { additionalProperties: false, type: "object" } } }))
  assert.match(diff.report("a"), /No changes detected/)
  diff.invalidate("a")
  diff.observe("a", request("new baseline", {}))
  assert.match(diff.report("a"), /needs two/)
})
