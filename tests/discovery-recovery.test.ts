import { expect, mock, spyOn, test } from "bun:test"

mock.module("@opencode/plugin", () => ({ Model: {}, Plugin: { define: (definition: unknown) => definition } }))

test("retries a failed catalog reload until it succeeds even when the inventory is unchanged", async () => {
  const { default: plugin } = await import("../plugins/openai-compatible-discovery/index.ts")
  const scheduled: Array<() => void | Promise<void>> = []
  const timer = spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) => {
    if (delay !== 1_000 && delay !== 60_000) throw new Error(`Unexpected refresh delay: ${delay}`)
    scheduled.push(() => callback(...args))
    return undefined as unknown as ReturnType<typeof setTimeout>
  })
  const warning = spyOn(console, "warn").mockImplementation(() => {})
  const fetchModels = spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: [] }))
  const reload = mock(async () => {}).mockRejectedValueOnce(new Error("Temporary reload failure"))
  const ctx = {
    model: { transform: async () => {}, reload },
    provider: {
      list: async () => ({ data: [{
        id: "mock",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: "http://127.0.0.1/v1", apiKey: "mock-token" },
      }] }),
    },
  }

  try {
    const cleanup = await plugin.setup(ctx)
    try {
      const refresh = async () => {
        const run = scheduled.shift()
        if (!run) throw new Error("No refresh scheduled")
        await run()
      }
      await refresh()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(warning).toHaveBeenCalledTimes(1)
      await refresh()
      expect(reload).toHaveBeenCalledTimes(2)
      await refresh()
      expect(reload).toHaveBeenCalledTimes(2)
      expect(fetchModels).toHaveBeenCalledTimes(3)
    } finally {
      cleanup()
    }
  } finally {
    fetchModels.mockRestore()
    warning.mockRestore()
    timer.mockRestore()
  }
})
