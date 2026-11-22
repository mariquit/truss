// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

export type UsageMessage = {
  id: string
  type: string
  time: { created: number; completed?: number }
  status?: string
  model?: { providerID: string; id: string; variant?: string }
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  cost?: number
}

const PAGE_SIZE = 50
const PAGE_LIMIT = 10

export async function readUsageHistory(read: (input: { limit: number; order?: "desc"; cursor?: string }) => Promise<{
  data: readonly UsageMessage[]
  cursor: { next?: string | null }
}>) {
  const messages = new Map<string, UsageMessage>()
  let cursor: string | undefined
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const result = await read(cursor ? { limit: PAGE_SIZE, cursor } : { limit: PAGE_SIZE, order: "desc" })
    for (const { id, type, time, status, model, tokens, cost } of result.data) {
      if (!messages.has(id)) messages.set(id, { id, type, time, status, model, tokens, cost })
    }
    if (!result.cursor.next) return { messages: [...messages.values()].reverse(), partial: false }
    if (result.cursor.next === cursor) break
    cursor = result.cursor.next
  }
  return { messages: [...messages.values()].reverse(), partial: true }
}

const totals = () => ({ records: 0, withTokens: 0, withCost: 0, input: 0, output: 0, reasoning: 0, read: 0, write: 0, cost: 0 })

function accumulate(sum: ReturnType<typeof totals>, message: UsageMessage) {
  sum.records++
  if (message.tokens) {
    sum.withTokens++
    sum.input += message.tokens.input
    sum.output += message.tokens.output
    sum.reasoning += message.tokens.reasoning
    sum.read += message.tokens.cache.read
    sum.write += message.tokens.cache.write
  }
  if (typeof message.cost === "number") {
    sum.withCost++
    sum.cost += message.cost
  }
}

const number = (value: number) => value.toLocaleString("en-US")
const model = (message: UsageMessage) => message.model
  ? `${message.model.providerID}/${message.model.id}${message.model.variant ? `#${message.model.variant}` : ""}` : "Unknown model"

function format(sum: ReturnType<typeof totals>) {
  const cost = sum.withCost ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 6 }).format(sum.cost) : "unavailable"
  return [
    ...(sum.withTokens ? [
      `Recorded input: ${number(sum.input)} · output: ${number(sum.output)} · reasoning: ${number(sum.reasoning)}`,
      `Cache reads: ${number(sum.read)} · writes: ${number(sum.write)}`,
    ] : ["Recorded tokens: unavailable"]),
    `Recorded cost: ${cost}`,
    `Records with token counts: ${sum.withTokens}/${sum.records} · with costs: ${sum.withCost}/${sum.records}`,
  ].join("\n")
}

export function summarizeUsage(messages: readonly UsageMessage[], partial: boolean) {
  const total = totals()
  const models = new Map<string, ReturnType<typeof totals>>()
  const turns: Array<{ label: string; total: ReturnType<typeof totals> }> = []
  let turn: typeof turns[number] | undefined
  let turnNumber = 0
  let latest: UsageMessage | undefined
  for (const message of messages) {
    if (message.type === "user") {
      turn = { label: `Turn ${++turnNumber}${partial ? " (in scanned history)" : ""} · ${new Date(message.time.created).toISOString()}`, total: totals() }
      turns.push(turn)
      continue
    }
    if (message.type === "compaction" && message.status === "completed") latest = undefined
    const assistant = message.type === "assistant" && message.time.completed !== undefined
    const compaction = message.type === "compaction" && message.status !== "running" && (message.tokens !== undefined || message.cost !== undefined)
    if (!assistant && !compaction) continue
    if (assistant && message.tokens) latest = message
    if (!turn) {
      turn = { label: "Before first visible user prompt", total: totals() }
      turns.push(turn)
    }
    const name = model(message)
    const group = models.get(name) ?? totals()
    models.set(name, group)
    for (const sum of [total, group, turn.total]) accumulate(sum, message)
  }
  const tokens = latest?.tokens
  const sample = tokens ? `${number(tokens.input + tokens.cache.read + tokens.cache.write + tokens.output + tokens.reasoning)} tokens (${model(latest!)})` : "unavailable"
  const scope = partial ? `Partial history: scanned ${number(messages.length)} recent records.` : "Current session history."
  return {
    summary: `${scope}\n\n${format(total)}\n\nLatest recorded context sample: ${sample}. This is not current context size or a compaction trigger.\n\nRecorded message usage only. Excludes child sessions and usage not attached to a message. Not an invoice.`,
    models: [...models].map(([label, sum]) => ({ label, text: format(sum) })),
    turns: turns.filter(entry => entry.total.records).reverse().map(entry => ({ label: entry.label, text: format(entry.total) })),
  }
}
