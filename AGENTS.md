## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## AI runtime architecture

For AI chat, runtime, streaming, protocol, and timeline work, preserve the architecture layers and fix issues in the correct layer.

Rules:
- Treat this stack as the default boundary order: `provider protocol adapters -> canonical runtime events -> timeline composer / conversation projection -> assistant render model / UI composition`.
- Before changing any AI/runtime bug or behavior, first decide which layer owns the problem. Do not patch a symptom in a lower layer if the issue is only about display.
- Do NOT put UI-specific rendering policy into provider adapters, runtime protocol types, canonical event mapping, or tool/runtime truth unless the requirement is genuinely cross-protocol and semantic.
- Do NOT change runtime truth (`tool` boundaries, canonical event semantics, persisted timeline facts, replay/recovery meaning) just to make the chat UI look better.
- Prefer fixing presentation issues in `projection`, `render model`, `message ordering`, or `UI composition` layers.
- If a change must cross layers, document why the lower-layer change is architecture-driven rather than a display workaround.
- When reviewing prior changes, explicitly check whether they violate this layer contract before keeping them.
