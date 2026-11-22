// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Plugin } from "@opencode/plugin/tui"
import { ContextDiff } from "./rpc.ts"

export default Plugin.define({
  id: "context-diff.tui",
  setup(ctx) {
    const session = () => {
      const route = ctx.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "context-diff.report",
        title: "Compare agent request context",
        palette: true,
        slash: { name: "context-diff" },
        enabled: () => session() !== undefined,
        async run() {
          const sessionID = session()
          if (!sessionID) return
          const location = ctx.data.session.get(sessionID)?.location ?? ctx.location ?? ctx.data.location.default()
          try {
            const result = await ctx.client.rpc(ContextDiff).report({ sessionID }, { location })
            if (session() !== sessionID) return
            if (!result || typeof result !== "object" || !("text" in result) || typeof result.text !== "string") {
              throw new Error("Unexpected Context Diff response.")
            }
            await ctx.ui.dialog.alert({ title: "Context Diff", message: result.text })
          } catch {
            if (session() === sessionID) ctx.ui.toast.show({ message: "Could not read the Context Diff report.", variant: "error" })
          }
        },
      }],
    }))
  },
})
