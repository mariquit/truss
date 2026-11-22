# Security Policy

## Reporting a vulnerability

Email **John Anthony Mariquit** at <john@mariquit.com> with the subject
`SECURITY: truss - <short summary>`. Do not open a public issue, pull request,
or discussion for a suspected vulnerability. If you want to encrypt the report,
ask for a key first without including the details.

Include the affected plugin ID or installer command, the Truss version or commit,
the OpenCode version, your OS, and the impact and conditions needed to observe it.
Include enough detail for the maintainer to verify the issue, but remove API keys,
private project data, and sensitive session text from any attachments.

### What to expect

Truss has one maintainer. These are best-effort targets, not guarantees:

| Stage | Target |
| --- | --- |
| Acknowledgement | Within 5 working days |
| Initial assessment | Within 14 days |
| Fix or documented mitigation | Depends on severity |

The maintainer will share the assessment and credit you in the fix unless you ask
not to be named. Allow time for a fix before disclosing publicly, and mention any
planned disclosure date in your first message.

## Supported versions

Only the latest commit on `main` receives security fixes. There are no backports
to earlier tags.

## Scope

### In scope

- Installer actions that modify files outside the intended OpenCode configuration,
  overwrite unselected plugins, or lose data that an upgrade promises to preserve.
- Model Discovery exposing provider credentials or sending them somewhere other
  than the configured gateway.
- Plugins exposing session data across session boundaries or persisting it beyond
  documented behavior.
- Compaction Audit exports writing outside the intended session directory or
  overwriting existing files.

### Out of scope

- Security issues in OpenCode, providers, or dependencies unless Truss's use of
  them creates the exposure. Report those issues upstream.
- Documented behavior, such as sending credentials to a gateway you configured
  or saving a summary after you confirm the export.
- Scanner output without a demonstrated impact in Truss.

## Notes for users

- Configure only gateways you trust with their provider credentials. Use
  environment-backed API keys rather than committing tokens to the repository.
- Do not track secrets with Compaction Audit. Preview the summary before exporting
  it, especially when connected to a remote server. The export is written on that
  server, not necessarily on the computer running the terminal client.
