// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

export type Checkpoint = {
  id: string
  status: "running" | "completed" | "failed"
  reason: "auto" | "manual"
  opaque: boolean
}

type Part = { type: string; text?: unknown }
type Request = {
  system: readonly Part[]
  messages: readonly { id?: string; content: readonly Part[] }[]
}
type Observation = { count: number; matches: Set<string>; tracked: Set<string> }
type Comparison = { id: string; before?: Observation; after?: Observation }
type State = { tracks: Set<string>; last?: Observation; comparison?: Comparison }

const SESSION_LIMIT = 128
const TRACK_LIMIT = 16
export const TEXT_LIMIT = 240

const normalize = (text: string) => text.trim().replace(/\s+/gu, " ")

function observe(request: Request, tracks: Set<string>): Observation {
  const matches = new Set<string>()
  if (tracks.size) {
    const inspect = (part: Part) => {
      if (part.type !== "text" || typeof part.text !== "string") return
      const text = normalize(part.text)
      for (const item of tracks) if (text.includes(item)) matches.add(item)
    }
    for (const part of request.system) inspect(part)
    for (const message of request.messages) for (const part of message.content) inspect(part)
  }
  return { count: request.messages.length, matches, tracked: new Set(tracks) }
}

export function makeAudit() {
  const sessions = new Map<string, State>()

  function state(id: string): State {
    const current = sessions.get(id) ?? { tracks: new Set<string>() }
    sessions.delete(id)
    sessions.set(id, current)
    if (sessions.size > SESSION_LIMIT) {
      const oldest = sessions.keys().next()
      if (!oldest.done) sessions.delete(oldest.value)
    }
    return current
  }

  return {
    track(id: string, text: string) {
      const item = normalize(text)
      if (!item || item.length > TEXT_LIMIT || /[\p{Cc}\p{Cf}]/u.test(item)) {
        return `Enter 1 to ${TEXT_LIMIT} characters of plain text.`
      }
      const { tracks } = state(id)
      if (tracks.has(item)) return "Already tracking this text."
      if (tracks.size >= TRACK_LIMIT) return `This session already tracks ${TRACK_LIMIT} phrases.`
      tracks.add(item)
      return "Tracking this text for future receipts."
    },
    begin(id: string, checkpoint: Checkpoint) {
      const current = state(id)
      if (checkpoint.status !== "running" || current.comparison?.id === checkpoint.id) return
      current.comparison = { id: checkpoint.id, before: current.last }
      current.last = undefined
    },
    observe(id: string, request: Request, checkpoint?: Checkpoint) {
      const current = state(id)
      const observation = observe(request, current.tracks)
      if (checkpoint?.status === "completed" && request.messages.some(message => message.id === checkpoint.id)) {
        if (current.comparison?.id !== checkpoint.id) current.comparison = { id: checkpoint.id }
        current.comparison.after ??= observation
      }
      current.last = observation
    },
    invalidate(id: string) {
      // A missed observation must not let an older request stand in for the latest one.
      const current = sessions.get(id)
      if (current) {
        current.last = undefined
        if (!current.comparison?.after) current.comparison = undefined
      }
    },
    receipt(id: string, checkpoint?: Checkpoint): string {
      if (!checkpoint) return "No compaction checkpoint found in the current session context."
      const heading = `Compaction receipt (${checkpoint.reason})`
      if (checkpoint.status === "failed") return `${heading}\nCompaction failed. No comparison was made.`
      if (checkpoint.status === "running") return `${heading}\nPending: compaction is still running.`
      const current = sessions.get(id)
      const comparison = current?.comparison?.id === checkpoint.id ? current.comparison : undefined
      const { before, after } = comparison ?? {}
      const scope = checkpoint.opaque ? "\nProvider-native context is opaque; only visible text was checked." : ""
      if (comparison && !after) {
        return `${heading}\nPending: no post-compaction agent request has been observed with this checkpoint.${scope}`
      }
      const lines = [
        heading,
        "Last observed agent request before compaction vs. first observed request after it.",
        `Messages: ${before?.count ?? "unavailable"} → ${after?.count ?? "unavailable"}.${scope}`,
      ]
      if (!before || !after) lines.push("Comparison unavailable: a request boundary was not observed.")
      if (!current?.tracks.size) lines.push("No tracked text. Use /compaction-track to add a phrase.")
      for (const item of current?.tracks ?? []) {
        const status = !before?.tracked.has(item) || !after?.tracked.has(item) ? "unavailable"
          : !before.matches.has(item) ? "not observed before compaction"
          : after.matches.has(item) ? "still visible" : "no longer matched"
        lines.push(`${status}: ${item}`)
      }
      if (current?.tracks.size) lines.push("Exact text only (whitespace normalized). A non-match can be a paraphrase.")
      return lines.join("\n")
    },
  }
}
