// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Plugin } from "@opencode/plugin"
import { makeAudit } from "./audit.ts"
import { prepareExport, saveExport } from "./export.ts"
import { CompactionAudit } from "./rpc.ts"

export default Plugin.define({
  id: "compaction-audit",
  async setup(ctx) {
    const audit = makeAudit()
    async function summaryExport(sessionID: string) {
      const messages = await ctx.session.context({ sessionID })
      const session = await ctx.session.get({ sessionID })
      return prepareExport(session.id, session.location.directory, messages)
    }
    async function checkpoint(sessionID: string) {
      const messages = await ctx.session.context({ sessionID })
      const latest = messages.findLast(message => message.type === "compaction")
      return latest && {
        id: latest.id,
        status: latest.status,
        reason: latest.reason,
        opaque: latest.status === "completed" && latest.native !== undefined,
      }
    }

    await ctx.session.hook("compaction", async ({ sessionID }) => {
      try {
        const current = await checkpoint(sessionID)
        if (current?.status === "running") audit.begin(sessionID, current)
        else audit.invalidate(sessionID)
      } catch {
        audit.invalidate(sessionID)
      }
    })
    await ctx.session.hook("context", async event => {
      try {
        audit.observe(event.sessionID, event, await checkpoint(event.sessionID))
      } catch {
        audit.invalidate(event.sessionID)
      }
    })

    await ctx.rpc.register(CompactionAudit, {
      exportPreview: async input => {
        const { sessionID } = input as { sessionID: string }
        return await summaryExport(sessionID) ?? { text: "No completed text compaction summary is available to export." }
      },
      exportSave: async input => {
        const { sessionID, revision } = input as { sessionID: string; revision: string }
        return saveExport(await summaryExport(sessionID), revision)
      },
      receipt: async input => {
        const { sessionID } = input as { sessionID: string }
        return { text: audit.receipt(sessionID, await checkpoint(sessionID)) }
      },
      track: async input => {
        const { sessionID, text } = input as { sessionID: string; text: string }
        await ctx.session.get({ sessionID })
        return { text: audit.track(sessionID, text) }
      },
    })
  },
})
