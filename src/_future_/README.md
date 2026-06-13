# `_future_` - proposed-API features

Everything in this folder depends on **proposed (unreleased) VS Code APIs** that
this extension does **not** enable via `enabledApiProposals`.

These features are **not no-ops**. They are *reactively operative*: the code
actively attempts to use the proposed API surface every time it runs. If the host
exposes and accepts it, the feature lights up; if the proposal is absent or the
gated call throws, the attempt is caught and the extension degrades gracefully.
Activation is attempted, never guaranteed.

Because we emit the data / call the API without declaring the proposal:

- A host that parses the proposed fields or honors the proposed call → feature works.
- A host that ignores them → no effect, no crash.

Contents:

- `chatStatusItem.ts` - token/cache widget in the chat status row (`window.createChatStatusItem`).
- `terminalCompletionProvider.ts` - shell command completions (`window.registerTerminalCompletionProvider`).
- `thinkingPart.ts` - reasoning surfaced as `LanguageModelThinkingPart`.
- `embeddingsProvider.ts` - Mistral embeddings via `lm.registerEmbeddingsProvider`.
- `proposedModelData.ts` - proposed fields on model info (capabilities, isDefault, configurationSchema) and the per-model `modelConfiguration` merge.

When any of these proposals graduate to stable, the corresponding file can move
back into the main tree and drop its defensive guards.
