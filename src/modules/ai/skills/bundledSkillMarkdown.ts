export const wikiSkillMarkdown = `---
name: Wiki
description: Read the current project notes and files, then answer or update context with a wiki-first view.
when_to_use: Use when the user wants project understanding, context stitching, note-grounded answers, or wiki-style upkeep.
skill: wiki
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
user-tag-invocable: false
disable-model-invocation: false
---

Goal: work from the current project notes and source files, then produce a grounded answer or update plan.

Workflow:
1. Start from the most relevant notes, pages, or source files already present in the project.
2. Separate confirmed facts from gaps or assumptions before answering.
3. Keep the result anchored to the current project instead of inventing a parallel workflow.

Output rules:
- Prefer concrete project evidence over generic advice.
- If the source context is incomplete, say what is known and what still needs confirmation.
- Do not claim files were updated unless a real file operation succeeded.
`;

export const sketchSkillMarkdown = `---
name: Sketch
description: Turn confirmed requirements into low-fidelity page structure and module-level wireframe guidance.
when_to_use: Use when the user wants information architecture or low-fidelity structure before visual polish.
skill: sketch
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
user-tag-invocable: false
disable-model-invocation: false
---

Goal: propose low-fidelity structure before detailed UI design.

Workflow:
1. Start from the confirmed target surface and canvas or breakpoint assumptions.
2. Start from page goals and user tasks.
3. Break each page into business-responsibility modules sized for that surface.
4. Keep the output low-fidelity and focused on structure, not styling.

Output rules:
- State the target surface at the top, including platform, orientation when relevant, and canvas or breakpoint assumptions.
- If the target surface is missing, ask for it or list separate mobile and desktop sketch assumptions rather than producing one ambiguous layout.
- Describe module purpose, key information, and actions.
- Make layout guidance surface-aware: mobile sketches should prioritize stacked flow, touch targets, and bottom or primary actions; desktop web sketches should prioritize wider information density, sidebars, tables, and multi-column scanning when appropriate.
- Avoid implementation code unless the user explicitly asks for a prototype.
`;

export const uiDesignSkillMarkdown = `---
name: UI Design
description: Refine interface guidance while preserving page goals, shell structure, and information hierarchy.
when_to_use: Use when the user wants UI design direction or implementation-ready interface guidance.
skill: ui-design
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
user-tag-invocable: false
disable-model-invocation: false
---

Goal: improve UI decisions without breaking the validated product structure underneath.

Workflow:
1. Preserve page goals, shell layout, and module responsibilities.
2. Improve hierarchy, clarity, states, and interaction details.
3. Keep recommendations implementation-ready.

Output rules:
- Do not rewrite core information architecture without saying why.
- Respect existing page structure and artifacts when present.
`;
