// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Plugin } from "@opencode/plugin/tui"
import { readUsageHistory, summarizeUsage } from "./src/usage.ts"

export default Plugin.define({
  id: "usage-breakdown.tui",
  setup(ctx) {
    const session = () => {
      const route = ctx.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "usage-breakdown.report",
        title: "Show session usage breakdown",
        palette: true,
        slash: { name: "usage-breakdown" },
        enabled: () => session() !== undefined,
        async run() {
          const sessionID = session()
          if (!sessionID) return
          const client = ctx.client
          try {
            const { messages, partial } = await readUsageHistory(input => client.message.list({ sessionID, ...input }, { signal: AbortSignal.timeout(10_000) }))
            if (session() !== sessionID) return
            const report = summarizeUsage(messages, partial)
            const items = [
              { title: "Session overview", category: "Summary", message: report.summary },
              ...report.models.map(item => ({ title: item.label, category: "Models", message: item.text })),
              ...report.turns.map(item => ({ title: item.label, category: "Turns", message: item.text })),
            ]
            const selected = await ctx.ui.dialog.select({
              title: partial ? "Usage Breakdown (partial history)" : "Usage Breakdown",
              options: items.map(({ title, category }, value) => ({ title, category, value })),
            })
            if (selected === undefined || session() !== sessionID) return
            const item = items[selected]
            await ctx.ui.dialog.alert({ title: item.title, message: item.message })
          } catch {
            if (session() === sessionID) ctx.ui.toast.show({ message: "Could not read usage for this session.", variant: "error" })
          }
        },
      }],
    }))
  },
})
