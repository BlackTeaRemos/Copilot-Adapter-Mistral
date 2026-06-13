# `_future_` - proposed-API features

Everything in this folder depends on proposed VS Code APIs that this extension does not enable via `enabledApiProposals`.

Extensions here attempts to use the proposed API surface. If the host exposes and accepts it, it works. Attempt is dropped silently if not successful.

When any of these proposals graduate to stable, the corresponding file can move back into the main tree and drop its defensive guards.
