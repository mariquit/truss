// Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises"
import { Model, Plugin, type Provider } from "@opencode/plugin"

const id = "openai-compatible-discovery"
const compatible = "@opencode/ai/providers/openai-compatible"
const mediaModes = ["text", "image", "audio", "video", "pdf"]
const effortLevels = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"])

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function patterns(value: unknown, field: string): RegExp[] | undefined {
  if (value === undefined) return
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of regex strings.`)
  return value.map((pattern: unknown, index) => {
    if (typeof pattern !== "string" || !pattern.length) throw new Error(`${field}[${index}] must be a non-empty regex string.`)
    try {
      return new RegExp(pattern)
    } catch {
      throw new Error(`${field}[${index}] is not a valid regular expression.`)
    }
  })
}

async function loadFilters(): Promise<ReadonlyMap<string, (modelID: string) => boolean>> {
  const filters = new Map<string, (modelID: string) => boolean>()
  let config: Record<string, unknown> | undefined
  try {
    config = record(JSON.parse(await readFile(new URL("./filters.json", import.meta.url), "utf8")))
    if (!config) throw new Error("Expected a provider map.")
  } catch (error) {
    if (record(error)?.code !== "ENOENT") console.warn(`[${id}] Could not read filters.json; discovery is unfiltered.`)
    return filters
  }

  for (const [providerID, value] of Object.entries(config)) {
    try {
      const rule = record(value)
      if (!rule || Object.keys(rule).some((key) => key !== "exclude")) {
        throw new Error("Expected an object with an optional exclude array.")
      }
      const exclude = patterns(rule.exclude, "exclude")
      filters.set(providerID, (modelID) => !exclude?.some((pattern) => pattern.test(modelID)))
    } catch (error) {
      console.warn(`[${id}] Invalid filters.json rule for ${JSON.stringify(providerID)}: ${error instanceof Error ? error.message : "Invalid rule."} Discovery is unfiltered for this provider.`)
    }
  }
  return filters
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function modalities(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return
  const known: string[] = []
  for (const entry of value) {
    const mode = entry === "file" ? "pdf" : entry
    if (typeof mode === "string" && mediaModes.includes(mode) && !known.includes(mode)) known.push(mode)
  }
  return known.length ? known : undefined
}

function toModel(providerID: Provider.ID, value: unknown): Model.Info | undefined {
  const card = record(value)
  if (!card || typeof card.id !== "string" || !card.id.trim() || card.id.includes("#")) return

  const base = Model.Info.default(providerID, Model.ID.make(card.id))
  const capabilities = record(card.capabilities)
  const input = modalities(card.input_modalities) ?? [
    "text",
    ...([["vision", "image"], ["audio_input", "audio"], ["video_input", "video"], ["file_input", "pdf"]] as const)
      .filter(([flag]) => capabilities?.[flag] === true)
      .map(([, mode]) => mode),
  ]
  const output = modalities(card.output_modalities) ?? ["text"]
  const reasoning = [capabilities?.reasoning, capabilities?.thinking, capabilities?.supportsThinking]
  const tiers = capabilities?.effort_tiers
  const efforts = reasoning.find((flag) => typeof flag === "boolean") !== false && Array.isArray(tiers)
    ? [...new Set(tiers.filter((tier): tier is string => typeof tier === "string" && effortLevels.has(tier)))]
    : []
  const advertisedContext = positiveInt(card.context_length) ?? positiveInt(card.max_model_len)
  const context = advertisedContext ?? base.limit.context
  const contextLabel = advertisedContext === undefined ? ""
    : advertisedContext < 1000 ? ` [${advertisedContext}]` : ` [${advertisedContext / 1000}k]`
  const inputLimit = positiveInt(card.max_input_tokens)
  const outputLimit = positiveInt(card.max_output_tokens) ?? Math.min(base.limit.output, context)

  return {
    ...base,
    name: `${card.id}${contextLabel}`,
    capabilities: { tools: capabilities?.tool_calling === true, input, output },
    limit: { context, output: outputLimit, ...(inputLimit === undefined ? {} : { input: inputLimit }) },
    variants: efforts.map((effort) => ({ id: Model.VariantID.make(effort), settings: { reasoningEffort: effort } })),
  }
}

function modelsURL(baseURL: string): URL {
  const url = new URL(baseURL)
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("The provider base URL must be HTTP(S) without embedded credentials.")
  }
  const path = url.pathname.replace(/\/+$/, "")
  url.pathname = `${path || "/v1"}/models`
  url.hash = ""
  return url
}

export default Plugin.define({
  id,
  async setup(ctx) {
    const filters = await loadFilters()
    const inventory = new Map<string, { baseURL: string; models: readonly Model.Info[] }>()
    const controller = new AbortController()

    async function discover(provider: Provider.Info, baseURL: string): Promise<readonly Model.Info[] | undefined> {
      try {
        const url = modelsURL(baseURL)
        const headers = new Headers(provider.headers)
        const apiKey: unknown = provider.settings?.apiKey
        if (!headers.has("authorization")) {
          if (typeof apiKey === "string" && apiKey.trim()) {
            headers.set("authorization", `Bearer ${apiKey}`)
          } else {
            const integrationID = provider.integrationID ?? provider.id
            const connection = await ctx.integration.connection.active(integrationID)
            if (connection) {
              // Saved accounts can switch independently of this inventory. Do not use their credentials here.
              if (connection.type !== "env") return []
              const credential = await ctx.integration.connection.resolve(connection)
              if (credential?.type !== "key") return
              headers.set("authorization", `Bearer ${credential.key}`)
            }
          }
        }
        headers.set("accept", "application/json")
        const response = await fetch(url, {
          headers,
          redirect: "error",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3_000)]),
        })
        if (!response.ok) {
          await response.body?.cancel()
          console.warn(`[${id}] ${provider.id}: model discovery returned HTTP ${response.status}.`)
          return
        }
        const payload = record(await response.json())
        if (!Array.isArray(payload?.data)) throw new Error("Expected a model list.")
        const models = new Map<string, Model.Info>()
        for (const card of payload.data) {
          const model = toModel(provider.id, card)
          if (model) models.set(model.id, model)
        }
        // A successful empty list means the gateway no longer advertises any models.
        if (!payload.data.length || models.size) {
          const allows = filters.get(provider.id)
          return [...models.values()].filter((model) => !allows || allows(model.id))
        }
      } catch {
        // URLs, request headers, response bodies and fetch errors may contain secrets.
        if (!controller.signal.aborted) console.warn(`[${id}] ${provider.id}: model discovery failed; previous models were kept.`)
      }
    }

    await ctx.model.transform((editor) => {
      for (const { models } of inventory.values()) {
        for (const model of models) {
          if (editor.get(model.providerID, model.id)) continue
          editor.update(model.providerID, model.id, (draft) => Object.assign(draft, structuredClone(model)))
        }
      }
    })

    // The config adapter may populate custom providers after this plugin's setup.
    // Refresh outside setup so provider activation does not wait on the network.
    let reloadPending = false
    async function refresh() {
      try {
        const { data: active } = await ctx.provider.list()
        const eligible = active.flatMap((provider) => {
          const baseURL: unknown = provider.settings?.baseURL
          if (provider.package !== compatible || provider.activation === "disabled"
            || typeof baseURL !== "string" || !baseURL.trim()) return []
          return [{ provider, baseURL }]
        })
        const results = await Promise.all(eligible.map(async ({ provider, baseURL }) => ({
          providerID: provider.id,
          baseURL,
          models: await discover(provider, baseURL),
        })))
        if (controller.signal.aborted) return
        let changed = false
        const eligibleIDs = new Set(eligible.map(({ provider }) => provider.id))
        for (const providerID of inventory.keys()) {
          if (!eligibleIDs.has(providerID)) changed = inventory.delete(providerID) || changed
        }
        for (const { providerID, baseURL, models } of results) {
          const previous = inventory.get(providerID)
          if (!models) {
            if (previous && previous.baseURL !== baseURL) changed = inventory.delete(providerID) || changed
            continue
          }
          if (previous?.baseURL === baseURL && JSON.stringify(models) === JSON.stringify(previous.models)) continue
          inventory.set(providerID, { baseURL, models })
          changed = true
        }
        reloadPending ||= changed
        if (reloadPending) {
          await ctx.model.reload()
          reloadPending = false
        }
      } catch {
        if (!controller.signal.aborted) console.warn(`[${id}] Could not refresh the provider catalog.`)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 60_000)
      }
    }

    let timer = setTimeout(refresh, 1_000)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  },
})
