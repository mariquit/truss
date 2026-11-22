# Usage Breakdown

Version: `v0.1.0`

`/usage-breakdown` groups recorded tokens and costs for the current session by model and by preceding user prompt. It lists input, output, reasoning, cache reads, and cache writes separately. The overview reports the latest recorded context sample apart from cumulative usage.

From the repository root, run `./install.sh usage-breakdown`. In an OpenCode terminal session with model responses, run `/usage-breakdown` or select **Show session usage breakdown** from the command palette. Choose the session overview, a model, or a turn to see its totals.

The plugin reads up to 500 recent message records and labels partial coverage. It excludes child sessions and usage that OpenCode did not attach to a message. It reports missing costs separately from recorded zero costs and does not estimate charges from the catalog. It needs no compaction hooks or other Truss plugins.
