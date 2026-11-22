import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { readUsageHistory, summarizeUsage } from "../plugins/usage-breakdown/src/usage.ts"

const card = {
  id: "mmcode/MiniMax-M3",
  object: "model",
  capabilities: {
    vision: true,
    tool_calling: true,
    reasoning: true,
    thinking: true,
    supportsThinking: true,
    effort_tiers: ["none", "low", "medium", "high", "xhigh", "max"],
    audio_input: false,
    video_input: false,
    file_input: false,
  },
  input_modalities: ["text", "image"],
  output_modalities: ["text"],
  context_length: 512000,
  max_output_tokens: 512000,
  max_input_tokens: 512000,
  name: "MiniMax M3",
}

const omniKeep = ["cursor/grok-4.7", "cx/gpt-6.1-terra", "cx/gpt-6.2-astra", "cx/gpt-6.2-sol"]
const omniExclude = [
  "auto",
  ...[
    "best-chaos", "best-chat", "best-coding", "best-coding-fast", "best-fast", "best-reasoning", "best-vision",
    "chaos", "chat", "cheap", "coding", "coding:cheap", "coding:fast", "coding:pro", "coding:reliable", "fast",
    "gpt", "lkgp", "multimodal", "offline", "pro-chat", "pro-coding", "pro-fast", "pro-reasoning", "pro-vision",
    "reasoning", "reasoning:pro", "smart", "thrifty", "vision",
  ].map((id) => `auto/${id}`),
  ...[
    "gpt-5.6-luna-image", "gpt-5.6-sol-image", "gpt-5.6-terra-image", "gpt-6.1-sol-image", "gpt-6.1-terra",
    "gpt-6.2-astra", "gpt-6.2-sol",
  ].map((id) => `codex/${id}`),
  "cu/grok-4.7", "cursor/auto", "cursor/composer-2", "cursor/composer-2.5", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6.2-sol",
]

test("installed plugins discover gateway models and report session context changes and usage", async () => {
  const root = mkdtempSync(join(tmpdir(), "opencode-discovery-"))
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: root,
    XDG_CONFIG_HOME: root,
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"),
    OPENCODE_DISABLE_FREE_MODELS: "1",
    MOCK_GATEWAY_KEY: "mock-token",
    OPENCODE_SERVER_PASSWORD: "mock-server-password",
  }
  delete env.OPENCODE_CONFIG
  delete env.OPENCODE_CONFIG_DIR
  delete env.OPENCODE_CONFIG_CONTENT
  const requests = new Set<string>()
  let completions = 0
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      requests.add(path)
      if (path === "/proxy/v1/models" || path === "/env/v1/models") {
        if (request.headers.get("authorization") !== "Bearer mock-token") return new Response(null, { status: 401 })
        return Response.json({ data: [card, { id: "thin" }, { id: "override" }, { id: "invalid#id" }] })
      }
      if (path === "/omni/v1/models") {
        return Response.json({ data: [
          ...omniKeep, ...omniExclude, "new/model",
        ].map((id) => {
          if (id === "cx/gpt-6.2-sol") return { id, name: "Shared gateway name", context_length: 256000, max_model_len: 128000 }
          if (id === "cx/gpt-6.2-astra") return { id, name: "Shared gateway name", max_model_len: 128500 }
          return { id }
        }) })
      }
      if (path === "/proxy/v1/chat/completions") {
        completions++
        const chunk = { id: "mock-completion", object: "chat.completion.chunk", created: 1, model: card.id }
        const frames = [
          { ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: "## Objective\n- Mock response" }, finish_reason: null }] },
          { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
          { ...chunk, choices: [], usage: { prompt_tokens: 23, completion_tokens: 7, total_tokens: 30 } },
        ]
        return new Response(`${frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })
      }
      return new Response(null, { status: 503 })
    },
  })

  try {
    const install = () => Bun.spawnSync(["bash", join(import.meta.dir, "../install.sh"), "--all"], { cwd: root, env })
    expect(install().exitCode).toBe(0)
    const pluginIDs = ["compaction-audit", "context-diff", "usage-breakdown", "openai-compatible-discovery"]
    const rootReadme = await Bun.file(join(import.meta.dir, "../README.md")).text()
    for (const id of pluginIDs) {
      for (const file of ["LICENSE", "NOTICE"]) {
        expect(await Bun.file(join(root, "opencode/plugins", id, file)).text()).toBe(
          await Bun.file(join(import.meta.dir, "..", file)).text(),
        )
      }
      const source = join(import.meta.dir, "../plugins", id)
      const versionedManifest = await Bun.file(join(source, "package.json")).text()
      expect(await Bun.file(join(root, "opencode/plugins", id, "package.json")).text()).toBe(versionedManifest)
      const { version, license } = JSON.parse(versionedManifest)
      expect(license).toBe("Apache-2.0")
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(rootReadme).toContain(`](plugins/${id}/README.md) \`v${version}\``)
      expect(await Bun.file(join(source, "README.md")).text()).toContain(`Version: \`v${version}\``)
    }
    const installed = join(root, "opencode/plugins/openai-compatible-discovery/index.ts")
    const installedFilters = join(dirname(installed), "filters.json")
    const example = await Bun.file(join(import.meta.dir, "../plugins/openai-compatible-discovery/filters.example.json")).text()
    expect(await Bun.file(installedFilters).text()).toBe(example)
    unlinkSync(installedFilters)
    const reinstall = install()
    expect(reinstall.exitCode).toBe(0)
    expect(reinstall.stdout.toString()).toContain("Already installed:")
    expect(await Bun.file(installedFilters).text()).toBe(example)
    const source = await Bun.file(installed).text()
    writeFileSync(installed, `${source}\n// Local change\n`)
    expect(install().exitCode).toBe(1)
    expect(await Bun.file(installed).text()).toEndWith("// Local change\n")
    writeFileSync(installed, source)
    const customFilters = JSON.stringify({
      ...JSON.parse(example),
      override: { exclude: ["^(thin|override)$"] },
      mock: { exclude: [] },
    })
    writeFileSync(installedFilters, customFilters)
    expect(install().exitCode).toBe(0)
    expect(await Bun.file(installedFilters).text()).toBe(customFilters)

    const auditDir = join(root, "opencode/plugins/compaction-audit")
    for (const file of ["package.json", "src/index.ts", "src/audit.ts", "src/export.ts", "src/rpc.ts", "src/tui.ts"]) {
      expect(await Bun.file(join(auditDir, file)).text()).toBe(
        await Bun.file(join(import.meta.dir, "../plugins/compaction-audit", file)).text(),
      )
    }
    expect(reinstall.stdout.toString()).toContain(`Already installed: ${auditDir}`)
    const auditEntry = join(auditDir, "src/index.ts")
    const auditSource = await Bun.file(auditEntry).text()
    writeFileSync(auditEntry, `${auditSource}\n// Local audit change\n`)
    expect(install().exitCode).toBe(1)
    expect(await Bun.file(auditEntry).text()).toEndWith("// Local audit change\n")
    writeFileSync(auditEntry, auditSource)

    const gateway = (path: string) => ({
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: new URL(path, server.url).href },
    })
    writeFileSync(join(root, "opencode/opencode.json"), JSON.stringify({
      providers: {
        mock: { ...gateway("/proxy/v1/"), settings: { ...gateway("/proxy/v1/").settings, apiKey: "mock-token" } },
        override: {
          ...gateway("/env/v1"),
          env: ["MOCK_GATEWAY_KEY"],
          models: { override: { name: "Configured override" } },
        },
        offline: { ...gateway("/offline/v1"), models: { fallback: { name: "Offline fallback" } } },
        omniroute: gateway("/omni/v1"),
        native: { ...gateway("/native/v1"), package: "@opencode/ai/providers/openai" },
      },
    }))

    const cli = Bun.spawn(["opencode", "serve", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "inherit",
      signal: AbortSignal.timeout(45_000),
    })
    try {
      const reader = cli.stdout.getReader()
      const { value } = await reader.read()
      const address = new TextDecoder().decode(value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      if (!address) throw new Error("OpenCode did not announce its listening address.")
      let models: Array<{ providerID: string; id: string }> = []
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        const res = await fetch(`${address}/api/model?directory=${encodeURIComponent(root)}`, {
          headers: { authorization: `Basic ${btoa(`opencode:${env.OPENCODE_SERVER_PASSWORD}`)}` },
          signal: AbortSignal.timeout(6_000),
        })
        if (res.ok) models = (await res.json()).data
        else throw new Error(`Model API returned ${res.status}: ${await res.text()}`)
        if (models.some((model) => model.providerID === "mock" && model.id === card.id)) break
        await Bun.sleep(100)
      }
      const find = (providerID: string, id: string) => models.find((model) => model.providerID === providerID && model.id === id)
      if (!find("mock", card.id)) throw new Error(`MiniMax did not appear; mock requests: ${[...requests].join(", ")}`)
      expect(find("mock", card.id)).toMatchObject({
        modelID: card.id,
        name: "mmcode/MiniMax-M3 [512k]",
        capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
        limit: { context: 512000, input: 512000, output: 512000 },
        variants: card.capabilities.effort_tiers.map((effort) => ({ id: effort, settings: { reasoningEffort: effort } })),
      })
      expect(find("mock", "thin")).toMatchObject({ name: "thin", capabilities: { tools: false, input: ["text"], output: ["text"] } })
      expect(find("mock", "invalid#id")).toBeUndefined()
      expect(find("override", card.id)).toBeDefined()
      expect(find("override", "thin")).toBeUndefined()
      expect(find("override", "override")).toMatchObject({ name: "Configured override" })
      expect(find("offline", "fallback")).toMatchObject({ name: "Offline fallback" })
      expect(models.filter((model) => model.providerID === "omniroute").map((model) => model.id).sort()).toEqual([...omniKeep, "new/model"])
      expect(find("omniroute", "cx/gpt-6.2-sol")).toMatchObject({ name: "cx/gpt-6.2-sol [256k]", limit: { context: 256000 } })
      expect(find("omniroute", "cx/gpt-6.2-astra")).toMatchObject({ name: "cx/gpt-6.2-astra [128.5k]", limit: { context: 128500 } })
      expect(requests).toEqual(new Set(["/proxy/v1/models", "/env/v1/models", "/offline/v1/models", "/omni/v1/models"]))

      const pluginResponse = await fetch(`${address}/api/plugin?directory=${encodeURIComponent(root)}`, {
        headers: { authorization: `Basic ${btoa(`opencode:${env.OPENCODE_SERVER_PASSWORD}`)}` },
        signal: AbortSignal.timeout(6_000),
      })
      expect(pluginResponse.status).toBe(200)
      const plugins = (await pluginResponse.json()).data as Array<{ id: string }>
      expect(plugins.find(({ id }) => id === "compaction-audit")).toMatchObject({
        features: { server: true, tui: true, rpc: true },
        state: { status: "active" },
      })
      expect(plugins.find(({ id }) => id === "context-diff")).toMatchObject({
        features: { server: true, tui: true, rpc: true }, state: { status: "active" },
      })
      expect(plugins.find(({ id }) => id === "usage-breakdown")).toMatchObject({
        features: { server: true, tui: true }, state: { status: "active" },
      })

      const api = async (path: string, body?: unknown) => {
        const res = await fetch(`${address}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            authorization: `Basic ${btoa(`opencode:${env.OPENCODE_SERVER_PASSWORD}`)}`,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
        return res.status === 204 ? undefined : res.json()
      }
      const { data: { id: sessionID } } = await api("/api/session", {
        title: "Audit integration", model: { providerID: "mock", id: card.id }, location: { directory: root },
      })
      const diffPath = `/api/rpc/context-diff/report?location%5Bdirectory%5D=${encodeURIComponent(root)}`
      expect((await api(diffPath, { input: { sessionID } })).output.text).toContain("needs two")
      for (const text of ["first prompt", "second prompt"]) {
        await api(`/api/session/${sessionID}/prompt`, { text })
        await api(`/api/experimental/session/${sessionID}/wait`, {})
        if (text === "first prompt") {
          await api(`/api/session/${sessionID}/model`, { model: { providerID: "mock", id: "thin" } })
        }
      }
      expect((await api(diffPath, { input: { sessionID } })).output.text).toContain(`Model: mock/${card.id}#default → mock/thin#default`)
      const history = await readUsageHistory(({ order, cursor }) => {
        const query = new URLSearchParams({ limit: "2" })
        if (order) query.set("order", order)
        if (cursor) query.set("cursor", cursor)
        return api(`/api/session/${sessionID}/message?${query}`)
      })
      expect(history.partial).toBe(false)
      const usage = summarizeUsage(history.messages, history.partial)
      expect(usage.summary).toContain("Recorded input: 46 · output: 14")
      expect(usage.models.map(item => item.label)).toEqual([`mock/${card.id}#default`, "mock/thin#default"])
      expect(usage.turns).toHaveLength(2)

      const rpcPath = (method: string) => `/api/rpc/compaction-audit/${method}?location%5Bdirectory%5D=${encodeURIComponent(root)}`
      const preview = async () => (await api(rpcPath("exportPreview"), { input: { sessionID } })).output
      expect(await preview()).toEqual({ text: "No completed text compaction summary is available to export." })
      await api(`/api/session/${sessionID}/compact`, {})
      await api(`/api/experimental/session/${sessionID}/wait`, {})
      const beforeExport = completions
      const handoff = await preview()
      if (!handoff.path) {
        const history = await api(`/api/session/${sessionID}/message?type=compaction`)
        throw new Error(`Missing export preview: ${JSON.stringify({ handoff, history })}`)
      }
      expect(handoff.path).toMatch(/\/TLDR-\d{8}-\d{4}\.md$/)
      expect(handoff.text).toContain(`Session ID: ${sessionID}`)
      expect(handoff.text).toContain("Checkpoint time (UTC): ")
      expect(handoff.text).toContain("Mock response")
      expect(existsSync(handoff.path)).toBe(false)
      const save = async (revision: string) => (await api(rpcPath("exportSave"), { input: { sessionID, revision } })).output
      expect((await save("0".repeat(64))).saved).toBe(false)
      expect(existsSync(handoff.path)).toBe(false)
      expect((await save(handoff.revision)).saved).toBe(true)
      expect(await Bun.file(handoff.path).text()).toBe(handoff.text)
      expect((await save(handoff.revision)).text).toContain("nothing was overwritten")
      expect(await Bun.file(handoff.path).text()).toBe(handoff.text)
      expect(completions).toBe(beforeExport)

      for (const disabled of pluginIDs) {
        const directory = join(root, `without-${disabled}`)
        mkdirSync(directory)
        writeFileSync(join(directory, "opencode.json"), JSON.stringify({ plugins: [`-${disabled}`] }))
        const expected = pluginIDs.filter(id => id !== disabled).sort()
        const path = `/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(directory)}`
        let active: string[] = []
        for (let attempt = 0; attempt < 30; attempt++) {
          const { data } = await api(path)
          active = data.filter((plugin: { id: string; state: { status: string } }) =>
            pluginIDs.includes(plugin.id) && plugin.state.status === "active").map((plugin: { id: string }) => plugin.id).sort()
          if (JSON.stringify(active) === JSON.stringify(expected)) break
          await Bun.sleep(100)
        }
        expect(active).toEqual(expected)
      }
    } finally {
      cli.kill()
      await cli.exited
    }
  } finally {
    await server.stop(true)
    rmSync(root, { recursive: true, force: true })
  }
}, 50_000)
