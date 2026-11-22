// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { Plugin } from "@opencode/plugin/tui"
import { CompactionAudit, responseText } from "./rpc.ts"
import { TEXT_LIMIT } from "./audit.ts"

export default Plugin.define({
  id: "compaction-audit.tui",
  setup(ctx) {
    const session = () => {
      const route = ctx.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }
    const unavailable = () => ctx.ui.toast.show({ message: "Compaction Audit could not reach its server plugin.", variant: "error" })
    const options = (sessionID: string) => ({
      location: ctx.data.session.get(sessionID)?.location ?? ctx.location ?? ctx.data.location.default(),
    })

    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "compaction-audit.export",
          title: "Export the latest compaction summary",
          palette: true,
          slash: { name: "compaction-export" },
          enabled: () => session() !== undefined,
          async run() {
            const sessionID = session()
            if (!sessionID) return
            const client = ctx.client
            const rpcOptions = options(sessionID)
            const audit = client.rpc(CompactionAudit)
            try {
              const preview = await audit.exportPreview({ sessionID }, rpcOptions)
              if (session() !== sessionID || ctx.client !== client) return
              const text = responseText(preview)
              if (!(preview && typeof preview === "object" && "path" in preview && typeof preview.path === "string"
                && "revision" in preview && typeof preview.revision === "string")) {
                await ctx.ui.dialog.alert({ title: "Compaction Export", message: text })
                return
              }
              const confirmed = await ctx.ui.dialog.confirm({
                title: "Export compaction summary?",
                message: `Save on the OpenCode server: ${preview.path}\n\n${text}`,
                label: { confirm: "Save", cancel: "Cancel" },
              })
              if (!confirmed || session() !== sessionID || ctx.client !== client) return
              const result = await audit.exportSave({ sessionID, revision: preview.revision }, rpcOptions)
              if (session() === sessionID && ctx.client === client) {
                const saved = result && typeof result === "object" && "saved" in result && result.saved === true
                ctx.ui.toast.show({ message: responseText(result), variant: saved ? "success" : "warning" })
              }
            } catch {
              if (session() === sessionID) ctx.ui.toast.show({ message: "Could not preview or save the compaction summary.", variant: "error" })
            }
          },
        },
        {
          id: "compaction-audit.receipt",
          title: "Show compaction receipt",
          palette: true,
          slash: { name: "compaction-receipt" },
          enabled: () => session() !== undefined,
          async run() {
            const sessionID = session()
            if (!sessionID) return
            try {
              const result = await ctx.client.rpc(CompactionAudit).receipt({ sessionID }, options(sessionID))
              if (session() === sessionID) await ctx.ui.dialog.alert({ title: "Compaction Audit", message: responseText(result) })
            } catch {
              unavailable()
            }
          },
        },
        {
          id: "compaction-audit.track",
          title: "Track exact text through compaction",
          palette: true,
          slash: { name: "compaction-track", arguments: true },
          enabled: () => session() !== undefined,
          async run(input) {
            const sessionID = session()
            if (!sessionID) return
            const text = (input?.trim() || await ctx.ui.dialog.prompt({ title: "Track exact text" }))?.trim()
            if (!text || session() !== sessionID) return
            if (text.length > TEXT_LIMIT) {
              ctx.ui.toast.show({ message: `Enter at most ${TEXT_LIMIT} characters.`, variant: "warning" })
              return
            }
            try {
              const result = await ctx.client.rpc(CompactionAudit).track({ sessionID, text }, options(sessionID))
              ctx.ui.toast.show({ message: responseText(result) })
            } catch {
              unavailable()
            }
          },
        },
      ],
    }))
  },
})
