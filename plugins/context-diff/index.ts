// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Plugin } from "@opencode/plugin"
import { makeContextDiff } from "./src/context-diff.ts"
import { ContextDiff } from "./rpc.ts"

export default Plugin.define({
  id: "context-diff",
  async setup(ctx) {
    const diff = makeContextDiff()
    await ctx.session.hook("context", async event => {
      try {
        const messages = await ctx.session.context({ sessionID: event.sessionID })
        const checkpoint = messages.findLast(message => message.type === "compaction" && message.status === "completed"
          && event.messages.some(item => item.id === message.id))
        diff.observe(event.sessionID, event, checkpoint?.id)
      } catch {
        diff.invalidate(event.sessionID)
      }
    })
    await ctx.rpc.register(ContextDiff, {
      report: async input => {
        const { sessionID } = input as { sessionID: string }
        await ctx.session.get({ sessionID })
        return { text: diff.report(sessionID) }
      },
    })
  },
})
