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

## AI chat output contract

For AI chat output, keep `thinking`, `tool`, `feedback`, and `final` as separate concepts.

Rules:
- `thinking` can be shown in the process timeline, but it is never the durable final answer body.
- `tool` facts must come from runtime / canonical tool events, not from re-parsing assistant prose.
- `feedback` is optional, short, and transient process text. It must never become the final persisted answer body.
- `final` is the only durable assistant answer body for a completed turn.
- If no tool is used, reply with `<final>...</final>` only.
- If tools are used, use runtime tool events as the source of truth and keep any `<feedback>` short. Do not restate tool protocol blocks inside `<final>`.

## Frontend UI standard

For all future frontend work, treat the workbench UI standard in `design/workbench-unified-previews/` as the default design contract, especially:
- `design/workbench-unified-previews/ui-standards.html`
- `design/workbench-unified-previews/overview-home.html`
- `design/workbench-unified-previews/state-standards.html`
- `design/workbench-unified-previews/workbench-preview.css`

This standard is not optional reference material. New pages, refactors, and component rewrites should follow it unless the user explicitly requests an exception.

### UI direction

Rules:
- Default to a native desktop tone: macOS-like, Finder / Notes-like, quiet, document-led, and tool-capable.
- Prefer a notes-first workbench over chat-app, SaaS dashboard, or marketing-site composition.
- Keep one dominant work surface in the main stage. Do not let multiple equally loud cards compete for attention.
- AI is a companion to work, not a full-page bubble feed.
- Prefer icon-led controls and concise labels over repeated text-heavy controls.

### Shell layout

Rules:
- Use the workbench shell order as the default layout: `rail -> sidebar -> main stage -> companion pane`.
- `rail` is for primary mode switching and should stay compact and icon-first.
- `sidebar` is list-oriented and should behave more like Notes / Finder lists and directory trees than stacked CRM cards.
- `main stage` is the visual center and should hold the primary note surface, infinite canvas, or work surface.
- `companion pane` is secondary support: AI, inspector, quick actions, or context. It must not compete with the main stage.

### Workspace primitives

Rules:
- Treat `note surface`, `directory tree`, and `infinite canvas` as first-class workbench primitives.
- `note surface` is the default reading/writing surface for AI workbench, docs, and long-form editing flows.
- `directory tree` is the default hierarchical navigation pattern for files, sources, and nested project structures.
- `infinite canvas` is the default main-stage pattern for graph, whiteboard, map, and spatial exploration flows.
- Choose one dominant primitive for the page center. Do not mix note surface and infinite canvas as equal co-heroes in the same stage.
- Directory trees should use indentation, disclosure, and flat row selection. Do not render folders and files as stacked rounded cards.
- Infinite canvas should feel open and edge-anchored, not boxed into dashboard cards or overly framed panels.
- `note surface` must consider at least: expanded, focused editing, collapsed summary, empty, syncing, and conflict review states.
- `directory tree` must consider at least: collapsed, expanded, selected, drag-over, loading children, and filtered-empty states.
- `infinite canvas` must consider at least: idle, panning, zoomed, node-selected, marquee-select, collapsed cluster, and empty states.

### Visual language

Rules:
- Keep the UI minimal, calm, and desktop-native. Use whitespace and hierarchy before adding borders or fills.
- Use restrained rounding only. Avoid bubbly chat pills, oversized capsules, and soft-card-over-card framing.
- Do not introduce decorative gradients into standard workbench UI.
- Avoid loud KPI dashboards, landing-page hero sections, and glossy SaaS chrome unless the user explicitly asks for that direction.
- Use restrained accent colors for focus, selection, AI emphasis, and status only.

### Theme rules

Rules:
- Every new frontend surface should support both light and dark themes or be written so theme support can be added without structural changes.
- Light and dark mode must keep the same hierarchy, spacing, and component roles.
- Do not use pure black dark mode. Follow the existing dark surface direction from the standard.
- Use semantic tokens and shared variables instead of hardcoded per-component colors when possible.

### AI card and lane rules

For AI-facing UI, the default lane order is:
- `user_input`
- `thinking`
- `tool_execution`
- `final_answer`
- `confirm_or_next_step` when needed

Rules:
- Render these as distinct lanes or cards, not as one merged chat blob.
- `thinking` is transient process context and must never become the durable final answer body.
- `tool_execution` must be sourced from runtime truth, not reconstructed from assistant prose.
- `final_answer` is the primary readable surface for a completed AI turn.
- Use confirm cards only when a real decision, escalation, or risky action needs user confirmation.
- If AI is embedded into a document workflow, prefer document-like cards and margin-note behavior over bubble chat.

### Motion and interaction rules

Rules:
- Motion must explain state changes such as hover, selection, reveal, loading, or confirmation. It must not be decorative.
- Keep interaction motion subtle and native-feeling.
- Provide clear states for default, hover, active, selected, focused, collapsed, expanded, loading, empty, error, confirm, warning, and disabled where applicable.
- Respect `prefers-reduced-motion`; removing animation must not remove state clarity.
- Avoid shimmer-heavy loading, floating animations, bouncy cards, and attention-seeking motion patterns.

### Implementation guardrails

Rules:
- Before building new workbench UI, review the latest standard pages in `design/workbench-unified-previews/`.
- Reuse shared tokens, card families, and layout patterns from the standard before inventing new ones.
- Reuse the standard workspace primitives intentionally: note surface, directory tree, and infinite canvas.
- If Chinese copy looks broken, run `python scripts/check_mojibake.py` before assuming the source file is corrupted. Distinguish real file mojibake from terminal or console encoding noise.
- Do not ship only the default state of a component. Cover collapsed / expanded / empty / loading / error behavior during implementation.
- When implementing a new AI page or refactoring AI chat, preserve the semantic separation between thinking, tools, feedback, and final.
- If a requested design conflicts with this standard, pause and call out the tradeoff explicitly before implementing.
- If a page intentionally deviates from the standard, document the reason in the relevant code or PR notes.
