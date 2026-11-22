# Truss workflow

Truss is a collection of independent OpenCode V2 plugins. Develop against the
repository source, verify the affected behavior, then test the installed copy
if the change affects installation or loading. See [CONTRIBUTING.md](CONTRIBUTING.md)
for prerequisites, test commands, and pull request requirements.

## Source and verification

| Path | Responsibility | What to verify in OpenCode |
| --- | --- | --- |
| [`plugins/compaction-audit/`](plugins/compaction-audit/) | Track exact phrases across compaction and export stored text summaries. | Observe a request on either side of compaction, then check `/compaction-receipt`. Preview a completed summary with `/compaction-export`. |
| [`plugins/context-diff/`](plugins/context-diff/) | Compare consecutive observed requests in the same session. | Let OpenCode make two requests, then check `/context-diff` for the expected differences. |
| [`plugins/usage-breakdown/`](plugins/usage-breakdown/) | Summarize recorded session usage by turn and model. | Run `/usage-breakdown` after model responses and verify that missing costs are not shown as zero. |
| [`plugins/openai-compatible-discovery/`](plugins/openai-compatible-discovery/) | Refresh the model catalog from an OpenAI-compatible gateway. | Check `/models` after discovery and verify that exclusions and explicit model definitions are respected. Use the mock gateway in the integration tests for repeatable checks. |
| [`install.sh`](install.sh) and [`install.py`](install.py) | Stage and publish the selected plugins. The Python menu returns the selection; Bash performs the file changes. | Use the isolated installer trial below. |

Edit files under `plugins/`, not the installed copies. When adding a file the
plugin needs at runtime, update that plugin's file list in `install.sh` and
verify that OpenCode loads the installed copy. A source-checkout trial alone
cannot catch an omitted runtime file. Do not load a source copy and an installed
copy of the same plugin in one test session.

## Isolated installer trial

Run from the repository root with a fresh config directory so the trial does not
touch your global installation:

```sh
test_dir=$(mktemp -d)
XDG_CONFIG_HOME="$test_dir" ./install.sh --all
XDG_CONFIG_HOME="$test_dir" ./install.sh --upgrade --all
XDG_CONFIG_HOME="$test_dir" opencode plugin list
```

Verify that the first run installs all four plugins, that the second reports each
as already installed, and that OpenCode lists all four plugin IDs. To verify menu
selection, run `./install.sh` with a different fresh `XDG_CONFIG_HOME` in a terminal
with Python 3.9 or later and `curses`. Check that only the selected plugins are
installed.

For upgrade changes, start with an older or modified copy in the test directory.
Verify that upgrading replaces only the selected copies that differ, keeps Model
Discovery's existing `filters.json`, and prints a `Backups:` path containing the
previous copies. If you change `LICENSE` or `NOTICE`, verify that the installer
copies the current files into each plugin directory. An older installed copy with
a different `LICENSE` or `NOTICE` requires `--upgrade` just like a code change.

## Recovery

The installer stages all selected changes before publishing and attempts to restore
the previous directories if publishing fails. If it prints `Rollback was incomplete`
and a `Recovery files:` path, keep that directory and inspect it alongside the active
plugin directories before retrying. Do not delete the recovery files until the
previous copies and local settings are accounted for.

After a successful upgrade or manual recovery, reload OpenCode with `/reload` and
use `opencode plugin list` with the same configuration to verify the expected IDs.
