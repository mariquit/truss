# Contributing to Truss

Truss collects plugins for OpenCode V2. Keep contributions focused on the behavior of the plugin or installer you are changing.

## Code of Conduct

Follow the [Code of Conduct](CODE_OF_CONDUCT.md), which explains how to report conduct concerns privately.

## Licensing of contributions

By submitting a contribution, you agree to license it under the project's [Apache License, Version 2.0](LICENSE). There is no contributor license agreement (CLA). You retain copyright in your work.

### Sign your work

Truss uses the [Developer Certificate of Origin 1.1](DCO). Sign off each commit to certify that you have the right to submit the contribution:

```sh
git commit -s
```

Git adds a `Signed-off-by: Your Name <your.email@example.com>` trailer. Use your real name and a working email address. To sign off your most recent commit on a local branch, use `git commit --amend -s`. To sign off your commits throughout a local branch, use `git rebase --signoff <base>`. Verify the trailers with `git log <base>..HEAD`.

### Copyright headers and attribution

Follow the existing header format in new first-party source files. In TypeScript, use `//` comments:

```ts
// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0
```

Use `#` comments in Bash and Python, keeping the shebang first if present. Preserve existing notices and add your own copyright line where appropriate. Mark modified files as required by Apache-2.0 §4.

Do not contribute material you lack the right to submit. If you adapt compatible third-party material, identify the source and license in the pull request and retain any required attribution in [NOTICE](NOTICE). See [TRADEMARK.md](TRADEMARK.md) for naming guidance when redistributing Truss or a fork.

## Project Overview

- [Model Discovery](plugins/openai-compatible-discovery/) adds models from OpenAI-compatible gateways. Its integration test uses a mock gateway and a separate OpenCode server.
- [Compaction Audit](plugins/compaction-audit/) compares tracked text before and after context compaction. Its unit tests cover receipt logic; use the plugin guide to exercise the terminal commands.
- [Context Diff](plugins/context-diff/) compares observed agent requests. [Usage Breakdown](plugins/usage-breakdown/) attributes recorded usage by turn and model.
- [`install.sh`](install.sh) installs and upgrades selected plugins. Keep the [installation guide](README.md#getting-started) aligned with changes to installation, backups, or rollback.

See [WORKFLOW.md](WORKFLOW.md) for source layout, verification, and installer recovery.

## Local Setup and Checks

Use Bun, OpenCode V2, Node.js 24 or later with npm, Bash, GNU coreutils, and `flock`. From the repository root, run:

```sh
npm --prefix plugins/compaction-audit ci
bun test
npm --prefix plugins/compaction-audit run typecheck
bash -n install.sh
git diff --check
```

The automated installer tests use temporary configuration directories. For manual install, menu, or upgrade checks, follow [the isolated installer trial](WORKFLOW.md#isolated-installer-trial).

For plugin behavior changes, test a representative workflow in OpenCode. Record the OpenCode version, input, expected behavior, and observed result. Distinguish automated results and manual trials from compatibility claims based only on documentation.

## How to Contribute

### Reporting Problems

Check existing issues before opening a report. Include the affected plugin or installer command, the OpenCode version, reproduction steps, and the expected and actual results. Remove secrets and private project data from logs and examples.

Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in the issue tracker.

### Pull Requests

1. Create a branch and keep the change focused on one improvement or fix. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit subjects and sign off each commit.
2. Update relevant tests, documentation, and examples.
3. Review the diff and run the relevant checks or representative trials.
4. Describe the problem, change, and validation results in the pull request. Identify any remaining verification gaps.

Use a scope that identifies the affected plugin or area, for example:

```text
fix(discovery): retain the last successful model inventory
test(install): cover filter preservation on upgrade
docs(workflow): explain installer recovery
```

Use the commit body to explain why the change is needed when the reason is not apparent from the diff.

## Questions

Open an issue or email John Anthony Mariquit at <john@mariquit.com>.
