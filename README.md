# Project: Truss

**Truss** is a suite of observability, debugging, and configuration utilities that expose what is happening under the hood of OpenCode sessions.

```text
  ┌───┬───┬───┬───┬───┐
  │ T │ R │ U │ S │ S │ v0.1.0
  └───┴───┴───┴───┴───┘
  Plugins for OpenCode
```

While OpenCode handles agent execution and session management well, key operational details—like how context mutates across turns, where token spend concentrates, and what models a custom gateway supports—often remain hidden in raw logs or static configs. Truss bridges these gaps with four focused plugins.

## Related OpenCode projects

- [Trestle](https://github.com/mariquit/trestle): Software engineering skills for OpenCode
- [Lattice](https://github.com/mariquit/lattice): Semantic codebase wiring for OpenCode
- [Span](https://github.com/mariquit/span): Contextual aggregate memory mesh for OpenCode
- [Formwork](https://github.com/mariquit/formwork): Spec-driven agent for solo developers on OpenCode
- [Catwalk](https://github.com/mariquit/catwalk): Terminal viewer for agent-owned TODO lists

## The Plugins

| Plugin | OpenCode gap | Plugin features |
| --- | --- | --- |
| [Compaction Audit](plugins/compaction-audit/README.md) `v0.1.0` | After compaction, the summary alone does not tell you whether an important requirement still appears verbatim in the agent's working context. | Compare selected phrases in observed requests before and after compaction so you can decide whether to restate a requirement. You can also save the existing summary as a Markdown handoff. |
| [Context Diff](plugins/context-diff/README.md) `v0.1.0` | When an agent behaves differently from one step to the next, the transcript does not show what changed in the assembled request. | Compare consecutive observed requests to spot changed instructions, tools, models, agents, or compaction checkpoints without digging through logs. |
| [Usage Breakdown](plugins/usage-breakdown/README.md) `v0.1.0` | Session totals do not tell you which turns or models drove token use or recorded cost. | Pinpoint high-usage turns and models, and distinguish cached input from fresh input. Missing cost data stays distinct from recorded zero cost. |
| [OpenAI-compatible Model Discovery](plugins/openai-compatible-discovery/README.md) `v0.1.0` | A custom gateway can advertise its own model catalog, yet OpenCode's generic compatible provider normally relies on a manually maintained list. | Select models from a catalog that refreshes from the gateway and reflects advertised limits and capabilities, without giving up your own model definitions or exclusions. |

## Getting Started

The installer requires Bash, GNU coreutils, and `flock`. For the interactive menu, install Python 3.9 or later with `curses`, then run from the repository root:

```sh
./install.sh
```

Use **Up/Down** to move, **Space** to toggle plugins, **Enter** to install the checked plugins, or **Esc** to cancel. Nothing is selected initially.

For unattended installs, pass one or more plugin IDs, or pass `--all` explicitly. Run `./install.sh --help` to list the IDs.

```sh
./install.sh context-diff usage-breakdown
./install.sh --all
```

The installer copies only the selected plugins to `${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/`. OpenCode discovers them automatically. The installer does not edit `opencode.json(c)` or require an npm install. Run `opencode plugin list` to verify that the selected IDs are loaded. A plain rerun leaves matching plugin code in place and refuses to replace a different or incomplete installation.

### Start a compaction audit

`compaction-audit` is the plugin ID, not a slash command. When OpenCode loads the plugin, it registers observers for agent requests and compaction. In your session, use `/compaction-track` to register a phrase before the agent request you want to compare. After compaction and the next agent request, use `/compaction-receipt` to read the comparison. See the [Compaction Audit walkthrough](plugins/compaction-audit/README.md#try-it-locally) for an example.

### Enable or disable a plugin

In `opencode.json(c)`, add `"-context-diff"` to `plugins` to disable Context Diff, or remove that entry to re-enable it. Keep unrelated plugin entries. Run `/reload` and check the result with `opencode plugin list`. The same rule applies to each of the four IDs; none requires another Truss plugin.

### Upgrade

Run `./install.sh --upgrade` for the selection menu, or pass the IDs to upgrade without a prompt:

```sh
./install.sh --upgrade compaction-audit context-diff usage-breakdown
```

The installer prepares all selected changes before replacing any installed copy. It installs missing selections, leaves matching and unselected copies in place, and replaces differing or incomplete selected directories. Model Discovery keeps its existing `filters.json`. Other local edits and extra files in a replaced directory stay in the backup, not in the active copy.

If the installer replaces a directory, it prints a `Backups:` path under the OpenCode config directory, outside `plugins/`. Keep that path if you need to recover an earlier copy. After a successful upgrade, run `/reload` in OpenCode and verify the selected IDs with `opencode plugin list`.

If publishing a plugin fails, the installer attempts to restore the previous directories. If it reports an incomplete rollback, keep the printed recovery directory; it contains the files needed for manual recovery.

If your installed Compaction Audit already bundles `/context-diff` or `/usage-breakdown`, upgrade `compaction-audit` in the same run as the standalone replacements. The installer refuses to add a duplicate command while the bundled copy is still in place. Omit either standalone ID if you do not want that feature.

## OpenAI-compatible Model Discovery

### Configure a gateway

Discovery applies to available providers using the exact package `@opencode/ai/providers/openai-compatible`. It appends `/models` to the configured base URL: `https://gateway.example.com/proxy/v1` becomes `https://gateway.example.com/proxy/v1/models`. For a URL with no path, it uses `/v1/models`.

Add the provider to `opencode.jsonc`. You do not need to declare any models:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "gateway": {
      "name": "Gateway",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://gateway.example.com/v1",
        "apiKey": "{env:GATEWAY_API_KEY}",
      },
    },
  },
}
```

Omit `apiKey` for gateways that do not need authentication. Discovery supports provider headers, `settings.apiKey`, and environment-backed OpenCode keys. It does not use saved `/connect` accounts or follow redirects. Set secrets in the OpenCode server's environment, not in the repository. Open `/models` to see the discovered entries; use `/reload` if OpenCode has not picked up the plugin.

Discovery runs in the background after load and refreshes about once a minute. A failed request keeps the last successful inventory in memory. An existing OpenCode model with the same ID wins in full, so you can still override a model or keep an explicit fallback.

Discovered models display their exact gateway ID followed by the advertised context window, for example `cx/gpt-6.2-sol [256k]` for 256,000 tokens. Without a valid `context_length` or `max_model_len`, the label shows only the ID. Explicitly configured display names are unchanged.

The plugin preserves slash-qualified model IDs and maps token limits, tool support, and input/output modalities. For example, `mmcode/MiniMax-M3` becomes `gateway/mmcode/MiniMax-M3`, and its advertised `xhigh` effort becomes `gateway/mmcode/MiniMax-M3#xhigh`. Cards that omit capability metadata default to text-only with tools off. Missing limits use OpenCode's defaults rather than guessed model-specific values. The plugin does not infer pricing or protocol-specific request quirks from the model name.

### Filter discovered models

The installer copies the bundled `filters.example.json` to `filters.json` beside `index.ts` if `filters.json` is missing. It never overwrites or merges an existing filter file.

Edit `filters.json` next to the installed `index.ts` to customize exclusions. The bundled [OmniRoute example](plugins/openai-compatible-discovery/filters.example.json) excludes the unwanted entries from the sample inventory, leaving `cursor/grok-4.7`, `cx/gpt-6.1-terra`, `cx/gpt-6.2-astra`, and `cx/gpt-6.2-sol`. New models still appear unless they match an exclusion. Run `/reload` after editing the file.

The top-level keys are OpenCode provider IDs. Each rule accepts an optional `exclude` array of JavaScript regular expressions written as JSON strings, without slash delimiters. Patterns match the case-sensitive gateway model ID, such as `cursor/grok-4.7`, not the OpenCode selector `omniroute/cursor/grok-4.7`.

- Discovery keeps all valid models by default. A model is excluded if its ID matches any of the provider's patterns. Omit `exclude` or set it to `[]` to keep all models.
- Filters affect only models added by discovery. Existing configured models and providers without rules are unchanged.
- An invalid provider rule logs a warning and leaves that provider unfiltered. A malformed or unreadable file logs a warning and leaves discovery unfiltered for all providers.

## Test

Run `bun test` with `opencode` on your `PATH`. The tests use temporary configuration directories to check upgrades, filter preservation, and rollback. The discovery integration test queries a mock gateway through a separate OpenCode server. Verified with OpenCode v2.2.5.

## License

Copyright (c) 2026 John Anthony Mariquit [john@mariquit.com](mailto:john@mariquit.com)

Truss's first-party code and documentation are licensed under the [Apache License, Version 2.0](./LICENSE). See [NOTICE](./NOTICE) for attribution. Third-party dependencies retain their own licenses.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local checks, issue reporting, and the pull request process.
