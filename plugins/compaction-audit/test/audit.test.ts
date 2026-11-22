import assert from "node:assert/strict"
import { test } from "node:test"
import { makeAudit, type Checkpoint } from "../src/audit.ts"

const running = { id: "checkpoint", status: "running", reason: "manual", opaque: false } satisfies Checkpoint
const done = { ...running, status: "completed" } satisfies Checkpoint
const text = (value: string) => ({ type: "text", text: value })
const request = (...items: string[]) => ({ system: [], messages: items.map(value => ({ content: [text(value)] })) })
const after = (value: string, id = done.id) => ({ system: [], messages: [{ id, content: [text(value)] }] })

test("reports retained, rephrased, and previously absent text using the first matched request", () => {
  const audit = makeAudit()
  for (const item of ["Use   UTC.", "Keep blue widgets.", "Enable dark mode."]) audit.track("a", item)
  audit.observe("a", request("Use UTC. Keep blue widgets.", "Working on it."))
  audit.begin("a", running)
  assert.match(audit.receipt("a", done), /Pending/)
  audit.observe("a", after("Use\nUTC. Preserve the blue widgets. Enable dark mode."), done)
  audit.observe("a", after("Keep blue widgets."), done)
  const receipt = audit.receipt("a", done)
  assert.match(receipt, /Messages: 2 → 1/)
  assert.match(receipt, /still visible: Use UTC\./)
  assert.match(receipt, /no longer matched: Keep blue widgets\./)
  assert.match(receipt, /not observed before compaction: Enable dark mode\./)
})

test("ignores a post-compaction observation unless it contains the checkpoint ID", () => {
  const audit = makeAudit()
  audit.observe("a", request("Before"))
  audit.begin("a", running)
  audit.observe("a", after("Wrong checkpoint", "old"), done)
  assert.match(audit.receipt("a", done), /Pending/)
  audit.observe("a", after("Right checkpoint"), done)
  assert.match(audit.receipt("a", done), /Messages: 1 → 1/)
})

test("does not require a completion event or a receipt read to capture the first matching request", () => {
  const audit = makeAudit()
  audit.observe("a", request("Before"))
  audit.begin("a", running)
  audit.observe("a", after("After"), done)
  assert.match(audit.receipt("a", done), /Messages: 1 → 1/)
})

test("labels a missed or invalidated baseline unavailable", () => {
  const audit = makeAudit()
  audit.track("a", "Track me.")
  audit.observe("a", request("Track me."))
  audit.invalidate("a")
  audit.observe("a", after("Track me."), done)
  const receipt = audit.receipt("a", done)
  assert.match(receipt, /Messages: unavailable → 1/)
  assert.match(receipt, /unavailable: Track me\./)
  assert.doesNotMatch(receipt, /still visible/)
})

test("preserves a completed receipt after an observation failure without reusing the old baseline", () => {
  const audit = makeAudit()
  audit.track("a", "Keep UTC.")
  audit.observe("a", request("Keep UTC."))
  audit.begin("a", running)
  audit.observe("a", after("Keep UTC."), done)
  const receipt = audit.receipt("a", done)
  assert.match(receipt, /still visible: Keep UTC\./)

  audit.invalidate("a")
  assert.equal(audit.receipt("a", done), receipt)

  const next = { ...done, id: "next-checkpoint" }
  audit.begin("a", { ...next, status: "running" })
  audit.observe("a", after("Keep UTC.", next.id), next)
  assert.match(audit.receipt("a", next), /Messages: unavailable → 1/)
})

test("reports failed compaction without leaking observations from another session", () => {
  const audit = makeAudit()
  audit.track("a", "Only in A.")
  audit.observe("a", request("Only in A."))
  audit.begin("a", running)
  audit.observe("b", after("Only in A."), done)
  assert.match(audit.receipt("a", { ...running, status: "failed" }), /Compaction failed/)
  assert.match(audit.receipt("b", done), /Messages: unavailable → 1/)
  assert.doesNotMatch(audit.receipt("b", done), /Only in A/)
})

test("checks system text but does not interpret provider-native content", () => {
  const audit = makeAudit()
  audit.track("a", "Track me.")
  audit.observe("a", { system: [text("Track me.")], messages: [] })
  audit.begin("a", running)
  const native = { ...done, opaque: true }
  audit.observe("a", { system: [], messages: [{ id: done.id, content: [{ type: "compaction", text: "Track me." }] }] }, native)
  assert.match(audit.receipt("a", native), /Provider-native context is opaque/)
  assert.match(audit.receipt("a", native), /no longer matched: Track me\./)
})
