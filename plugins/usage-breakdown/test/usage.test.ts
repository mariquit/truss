import assert from "node:assert/strict"
import { test } from "node:test"
import { readUsageHistory, summarizeUsage, type UsageMessage } from "../src/usage.ts"

const item = (id: string, type: string): UsageMessage => ({ id, type, time: { created: 1, completed: 2 } })
const tokens = { input: 10, output: 3, reasoning: 2, cache: { read: 100, write: 4 } }
const step = (id: string, model: string): UsageMessage => ({ ...item(id, "assistant"), model: { providerID: "test", id: model }, tokens })

test("breaks down recorded usage by model and prompt without treating unknown cost as zero", () => {
  const report = summarizeUsage([
    item("prompt-1", "user"), { ...step("a", "one"), cost: 0 }, step("b", "one"),
    item("prompt-2", "user"), { ...item("compact", "compaction"), status: "completed", cost: 0.125 },
    step("c", "two"), { ...step("pending", "three"), time: { created: 3 } },
  ], false)
  assert.match(report.summary, /Recorded input: 30 · output: 9 · reasoning: 6/)
  assert.match(report.summary, /Cache reads: 300 · writes: 12/)
  assert.match(report.summary, /Latest recorded context sample: 119 tokens \(test\/two\)/)
  assert.match(report.summary, /with costs: 2\/4/)
  assert.deepEqual(report.models.map(model => model.label), ["test/one", "Unknown model", "test/two"])
  assert.match(report.models[0].text, /Recorded cost: \$0/)
  assert.match(report.models[2].text, /Recorded cost: unavailable/)
  assert.match(report.turns[0].label, /^Turn 2/)
  assert.match(report.turns[1].text, /Cache reads: 200/)
})

test("does not show a pre-compaction context sample as the latest sample", () => {
  const report = summarizeUsage([step("a", "one"), { ...item("compact", "compaction"), status: "completed" }], true)
  assert.match(report.summary, /Partial history/)
  assert.match(report.summary, /Latest recorded context sample: unavailable/)
  assert.match(report.summary, /Recorded input: 10/)
})

test("pages backwards, deduplicates records, and returns chronological order", async () => {
  const result = await readUsageHistory(async ({ cursor, order }) => {
    assert.equal(order, cursor === undefined ? "desc" : undefined)
    return cursor === undefined
      ? { data: [item("b", "assistant")], cursor: { next: "older" } }
      : { data: [item("b", "assistant"), item("a", "user")], cursor: {} }
  })
  assert.equal(result.partial, false)
  assert.deepEqual(result.messages.map(message => message.id), ["a", "b"])
})

test("bounds history reads and labels the result partial", async () => {
  let calls = 0
  const result = await readUsageHistory(async () => ({ data: [], cursor: { next: String(++calls) } }))
  assert.equal(calls, 10)
  assert.equal(result.partial, true)
})
