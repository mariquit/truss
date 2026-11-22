// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"

type CheckpointMessage = {
  id: string
  type: string
  status?: string
  time: { created: number }
  summary?: string
  native?: unknown
}

export function prepareExport(sessionID: string, directory: string, messages: readonly CheckpointMessage[]) {
  const latest = messages.findLast(message => message.type === "compaction" && message.status === "completed"
    && message.native === undefined && message.summary?.trim())
  if (!latest?.summary) return

  const time = new Date(latest.time.created).toISOString()
  const stamp = `${time.slice(0, 10).replaceAll("-", "")}-${time.slice(11, 16).replace(":", "")}`
  const path = join(directory, `TLDR-${stamp}.md`)
  const text = `# Compaction summary\n\nSession ID: ${sessionID}\n\nCheckpoint time (UTC): ${time}\n\n${latest.summary}${latest.summary.endsWith("\n") ? "" : "\n"}`
  const revision = createHash("sha256").update(JSON.stringify([latest.id, path, text])).digest("hex")
  return { path, text, revision }
}

export async function saveExport(preview: ReturnType<typeof prepareExport>, revision: string) {
  if (!preview || preview.revision !== revision) {
    return { text: "The export has changed. Run /compaction-export again to preview it.", saved: false }
  }
  try {
    await writeFile(preview.path, preview.text, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    return { text: `File already exists; nothing was overwritten: ${preview.path}`, saved: false }
  }
  return { text: `Saved on the OpenCode server: ${preview.path}`, saved: true }
}
