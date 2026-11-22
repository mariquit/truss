import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "opencode-installer-"))
  const config = join(root, "opencode")
  const discovery = join(config, "plugins/openai-compatible-discovery")
  const audit = join(config, "plugins/compaction-audit")
  const install = (args: string[], path = process.env.PATH) => Bun.spawnSync(
    ["bash", join(import.meta.dir, "../install.sh"), ...args],
    { env: { ...process.env, XDG_CONFIG_HOME: root, PATH: path } },
  )
  return { root, discovery, audit, install }
}

test("upgrades legacy directories and preserves filters and complete backups", () => {
  const { root, discovery, audit, install } = fixture()
  try {
    mkdirSync(discovery, { recursive: true })
    mkdirSync(join(audit, "src"), { recursive: true })
    writeFileSync(join(discovery, "index.ts"), "old discovery")
    writeFileSync(join(discovery, "filters.json"), '{"gateway":{"exclude":["old-model"]}}\n')
    writeFileSync(join(audit, "src/index.ts"), "old audit")
    writeFileSync(join(audit, "notes.txt"), "local notes")

    expect(install(["--all"]).exitCode).toBe(1)
    const result = install(["--upgrade", "--all"])
    expect(result.stderr.toString()).toBe("")
    expect(result.exitCode).toBe(0)
    const backup = result.stdout.toString().match(/^Backups: (.+)$/m)?.[1]
    if (!backup) throw new Error("Installer did not report the backup path")
    expect(backup).toStartWith(join(root, "opencode/.addon-install."))
    expect(readFileSync(join(backup, "openai-compatible-discovery/index.ts"), "utf8")).toBe("old discovery")
    expect(readFileSync(join(backup, "compaction-audit/src/index.ts"), "utf8")).toBe("old audit")
    expect(readFileSync(join(backup, "compaction-audit/notes.txt"), "utf8")).toBe("local notes")
    expect(readFileSync(join(discovery, "filters.json"), "utf8")).toBe('{"gateway":{"exclude":["old-model"]}}\n')
    expect(readFileSync(join(audit, "src/index.ts"), "utf8")).toBe(
      readFileSync(join(import.meta.dir, "../plugins/compaction-audit/src/index.ts"), "utf8"),
    )

    const rerun = install(["--upgrade", "--all"])
    expect(rerun.exitCode).toBe(0)
    expect(rerun.stdout.toString()).not.toContain("Backups:")
    expect(rerun.stdout.toString()).toContain(`Already installed: ${discovery}`)
    expect(rerun.stdout.toString()).toContain(`Already installed: ${audit}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("restores both old directories when publishing the second plugin fails", () => {
  const { root, discovery, audit, install } = fixture()
  try {
    expect(install(["--all"]).exitCode).toBe(0)
    writeFileSync(join(discovery, "index.ts"), "old discovery")
    writeFileSync(join(audit, "src/index.ts"), "old audit")
    const bin = join(root, "bin")
    mkdirSync(bin)
    const mv = Bun.which("mv")
    if (!mv) throw new Error("mv is required")
    symlinkSync(mv, join(bin, "real-mv"))
    writeFileSync(join(bin, "mv"), `#!/usr/bin/env bash
if [[ $3 == */staged/compaction-audit ]]; then
  echo 'Injected publish failure' >&2
  exit 1
fi
exec "$(dirname -- "$0")/real-mv" "$@"
`, { mode: 0o755 })

    const result = install(["--upgrade", "--all"], `${bin}:${process.env.PATH}`)
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("Injected publish failure")
    expect(result.stderr.toString()).not.toContain("Rollback was incomplete")
    expect(readFileSync(join(discovery, "index.ts"), "utf8")).toBe("old discovery")
    expect(readFileSync(join(audit, "src/index.ts"), "utf8")).toBe("old audit")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("refuses a symlinked plugin directory without installing the other plugin", () => {
  const { root, discovery, audit, install } = fixture()
  try {
    mkdirSync(join(root, "opencode/plugins"), { recursive: true })
    const external = join(root, "external")
    mkdirSync(external)
    writeFileSync(join(external, "package.json"), "do not replace")
    symlinkSync(external, audit)

    const result = install(["--upgrade", "--all"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("Refusing to replace a symlink or non-directory")
    expect(existsSync(discovery)).toBe(false)
    expect(readFileSync(join(audit, "package.json"), "utf8")).toBe("do not replace")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("installs and upgrades only the selected plugin IDs", () => {
  const { root, discovery, audit, install } = fixture()
  try {
    const plugins = join(root, "opencode/plugins")
    const diff = join(plugins, "context-diff")
    const usage = join(plugins, "usage-breakdown")
    expect(install(["context-diff", "usage-breakdown", "context-diff"]).exitCode).toBe(0)
    expect(existsSync(join(diff, "index.ts"))).toBe(true)
    expect(existsSync(join(usage, "index.ts"))).toBe(true)
    expect(existsSync(discovery)).toBe(false)
    expect(existsSync(audit)).toBe(false)
    writeFileSync(join(diff, "index.ts"), "local change")
    const result = install(["--upgrade", "usage-breakdown"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).not.toContain("Backups:")
    expect(readFileSync(join(diff, "index.ts"), "utf8")).toBe("local change")
    expect(install(["--all", "context-diff"]).exitCode).toBe(2)
    expect(install(["unknown-plugin"]).exitCode).toBe(2)
    expect(existsSync(audit)).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("the terminal menu toggles multiple plugins and Escape cancels", () => {
  const { root } = fixture()
  try {
    const result = Bun.spawnSync(["python3", join(import.meta.dir, "installer-menu.py"), join(import.meta.dir, "../install.sh")], {
      env: { ...process.env, XDG_CONFIG_HOME: root, TERM: "xterm" },
      timeout: 15_000,
    })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString())
    expect(existsSync(join(root, "opencode/plugins/openai-compatible-discovery/index.ts"))).toBe(true)
    expect(existsSync(join(root, "opencode/plugins/usage-breakdown/index.ts"))).toBe(true)
    expect(existsSync(join(root, "opencode/plugins/context-diff"))).toBe(false)
    expect(existsSync(join(root, "opencode/plugins/compaction-audit"))).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("requires a bundled Audit copy to be upgraded before installing a duplicate command", () => {
  const { root, audit, install } = fixture()
  try {
    const diff = join(root, "opencode/plugins/context-diff")
    expect(install(["compaction-audit"]).exitCode).toBe(0)
    writeFileSync(join(audit, "src/tui.ts"), 'const command = { slash: { name: "context-diff" } }\n')
    const result = install(["context-diff"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("Compaction Audit already defines /context-diff")
    expect(existsSync(diff)).toBe(false)
    expect(install(["--upgrade", "compaction-audit", "context-diff"]).exitCode).toBe(0)
    expect(existsSync(join(diff, "index.ts"))).toBe(true)
    expect(readFileSync(join(audit, "src/tui.ts"), "utf8")).not.toContain('name: "context-diff"')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
