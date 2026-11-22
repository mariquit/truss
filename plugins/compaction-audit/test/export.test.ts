import assert from "node:assert/strict"
import { join } from "node:path"
import { test } from "node:test"
import { prepareExport } from "../src/export.ts"

test("previews the latest completed nonempty text summary and names it in UTC", () => {
  const checkpoint = {
    id: "checkpoint",
    type: "compaction",
    status: "completed",
    time: { created: Date.parse("2026-11-21T09:05:42.000Z") },
    summary: "## Objective\n- Finish the migration.",
  }
  const preview = prepareExport("session", "project", [
    { ...checkpoint, id: "older", summary: "Older summary" },
    checkpoint,
    { ...checkpoint, id: "pending", status: "running" },
    { ...checkpoint, id: "native", native: {} },
    { ...checkpoint, id: "blank", summary: " \n" },
  ])

  assert.equal(preview?.path, join("project", "TLDR-20261121-0905.md"))
  assert.equal(preview?.text, "# Compaction summary\n\nSession ID: session\n\nCheckpoint time (UTC): 2026-11-21T09:05:42.000Z\n\n## Objective\n- Finish the migration.\n")
  assert.notEqual(preview?.revision, prepareExport("session", "another-project", [checkpoint])?.revision)
  assert.notEqual(preview?.revision, prepareExport("session", "project", [{ ...checkpoint, id: "replacement" }])?.revision)
})
