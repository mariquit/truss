# OpenAI-compatible Model Discovery

Version: `v0.1.0`

Model Discovery adds models advertised by gateways using `@opencode/ai/providers/openai-compatible`. It refreshes the list in the background, maps advertised token limits and capabilities, and keeps explicitly configured models unchanged.

From the repository root, run `./install.sh openai-compatible-discovery`. Follow the [gateway configuration and filtering guide](../../README.md#openai-compatible-model-discovery), then open `/models` to verify the discovered entries. The plugin does not require any other Truss plugin.
