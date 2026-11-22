# Context Diff

Version: `v0.1.0`

`/context-diff` compares the two latest observed agent requests in the current session, including tool-driven continuations. It reports changes to the model, agent, system text, instruction sources, tool definitions, and visible compaction checkpoint. Compaction is not required.

From the repository root, run `./install.sh context-diff`. In an OpenCode terminal session, let the agent make two requests, then run `/context-diff` or select **Compare agent request context** from the command palette.

The report reflects what the context hook observed, not necessarily the final provider payload. Instruction-source metadata is experimental and may be absent. The plugin holds fingerprints and identifiers in memory for up to 128 sessions, not instruction text or tool schemas. A plugin reload clears its observations. Compaction Audit and Usage Breakdown are not required.
