# Compaction Audit

Version: `v0.1.0`

Compaction Audit is an OpenCode V2 terminal plugin that shows whether exact phrases still appear in the agent's request after context compaction. Its report is called a **receipt**.

## Commands

| Command | What it does |
| --- | --- |
| `/compaction-track` | Tracks an exact phrase without sending it to the model. |
| `/compaction-receipt` | Shows whether tracked phrases matched before and after compaction. |
| [`/compaction-export`](#export-a-handoff) | Previews the latest completed text summary and saves it as `TLDR-<yyyymmdd-hhmi>.md` after confirmation. |

## Try it locally

Run `./install.sh compaction-audit` from the repository root to install only Compaction Audit. Open a terminal session and follow steps 3 and 4 to verify it. For development against the source checkout instead, follow all four steps below. Do not configure the source checkout alongside a global copy.

1. From the repository root, run `npm --prefix plugins/compaction-audit ci`.
2. Add `./plugins/compaction-audit` to `plugins` in the repository-root `opencode.jsonc`. Keep any existing entries. Paths are relative to the configuration file.

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": ["./plugins/compaction-audit"]
   }
   ```

3. Open a session in the OpenCode terminal. Run `/compaction-track Keep timestamps in UTC.` to track that exact phrase without sending it to the model.
4. Include the phrase in a normal prompt and let the agent respond. Compact the session, then send another prompt that does not repeat the phrase. Run `/compaction-receipt` to check the result. If compaction finished but the next agent request has not been observed, the receipt is pending.

The plugin targets OpenCode V2.2.5. The slash commands are also available from the command palette.

## Read the receipt

- **Still visible:** The phrase matched before and after compaction.
- **No longer matched:** The phrase matched before but not after. The meaning may have survived in a paraphrase.
- **Not observed before compaction:** The phrase did not match in the baseline request.
- **Unavailable:** The plugin missed a request boundary or the phrase was not being tracked at that boundary.

Matching is case-sensitive and normalizes whitespace. It checks each plain-text part of the system instructions and messages separately. It does not inspect files, images, tool payloads, or opaque provider-native checkpoints. Message counts exclude system instructions and are not token counts. New messages and live instructions can also change between observations, so not every difference is caused by compaction. Other plugins can modify the request after this plugin observes it.

The plugin does not change model requests or compaction, make extra model calls, or persist transcripts. Tracked phrases and receipt observations are held in server memory for up to 128 recently observed sessions, with up to 16 phrases per session. They reset when the plugin reloads or the server restarts. Do not track secrets, especially when connected to a remote server.

## Export a handoff

After a text compaction completes, run `/compaction-export` to preview the latest completed text summary and its destination. Choose **Save** to write `TLDR-<yyyymmdd-hhmi>.md` to the session directory on the connected OpenCode server. Check the path in the confirmation toast and open the file to verify the session ID and full UTC checkpoint time. The filename uses the same checkpoint's UTC timestamp.

The command reuses the stored summary without running compaction or calling a model. It skips opaque provider-native checkpoints and never overwrites a file, even if two checkpoints share the same minute. Review the preview for sensitive details before saving or sharing it.

## Development

With Node.js 24 or later:

```sh
npm ci
npm test
npm run typecheck
```

The unit tests cover receipt logic and export formatting. The repository integration test uses OpenCode V2.2.5 and a mock provider to verify export preview, save, overwrite protection, and that exporting makes no extra model calls.
