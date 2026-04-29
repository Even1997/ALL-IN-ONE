---
name: goodnight-m-flow
description: Use when GoodNight should answer from the local vault with M-Flow style graph-routed memory, inverted-cone relevance, facet/facet-point/entity routing, bundle search, and manual refresh indexing.
---

# GoodNight M-Flow

## Design Intent

Use `m-flow` as GoodNight's default knowledge method when the user asks a question over the local vault. The upstream idea is not "keyword chunks with nicer names." It is graph-routed memory:

1. Episodes preserve source moments.
2. Facets group the angle of relevance.
3. FacetPoints hold concrete claims or observations inside a facet.
4. Entities anchor people, objects, files, modules, projects, and decisions.
5. Paths connect a question to evidence through the graph.
6. Bundle search returns coherent evidence neighborhoods instead of isolated chunks.

GoodNight adapts that into Markdown artifacts so a human or agent can inspect the reasoning path. This skill is grounded in the cloned `FlowElement-ai/m_flow` repository, especially `docs/RETRIEVAL_ARCHITECTURE.md`, `m_flow/retrieval/episodic/bundle_scorer.py`, and the domain models `Episode`, `Facet`, `FacetPoint`, and `Entity`.

## Mental Model

Think of M-Flow as an inverted cone.

- Start broad: detect candidate facets from the user's question and the base index.
- Narrow through facet points: find the concrete claims or observations that matter.
- Anchor on entities: identify the specific module, doc, decision, person, object, or workflow.
- Expand into bundles: pull nearby episodes and sources that make the path understandable.
- Answer through the cheapest coherent path, not through the highest keyword overlap.

## Working Contract

- Start from `.goodnight/base-index/` after a manual refresh.
- Treat `.goodnight/base-index/` as the raw index, not the final memory graph.
- Store generated M-Flow artifacts under `_goodnight/outputs/m-flow/`.
- Store routing notes under `.goodnight/skills/m-flow/`.
- Use Markdown for model-facing artifacts. The agent-readable graph is Markdown, not JSON.
- Do not serialize the graph as JSON for the agent to read.
- Prefer the smallest evidence bundle that explains the answer and why it is relevant.

## Artifact Roles

### Episodes

Write `_goodnight/outputs/m-flow/episodes/<source-slug>.md`.

An episode captures a source moment: what this file or note says, why it exists, and what evidence it contributes. Episodes should preserve source path, kind, tags, summary, and selected chunks.

### Facets

Write `_goodnight/outputs/m-flow/facets/<facet-slug>.md`.

A facet is a relevance angle such as `architecture`, `bug`, `design`, `workflow`, `requirement`, `test`, `decision`, or a domain tag from the source. Facets help route broad questions before choosing exact evidence.

### FacetPoints

Write `_goodnight/outputs/m-flow/facet-points/<source-or-claim-slug>.md`.

A facet point is a specific claim, observation, constraint, or decision inside a facet. Use it to avoid treating a whole source file as one undifferentiated chunk.

### Entities

Write `_goodnight/outputs/m-flow/entities/<entity-slug>.md`.

An entity anchors concrete things: files, modules, screens, features, users, APIs, decisions, or named concepts. Entities should link back to episodes and facet points.

### Paths

Write `_goodnight/outputs/m-flow/paths/<path-slug>.md`.

A path explains how a question reaches evidence:

```text
question -> facet -> facet point -> entity -> episode/source
```

Each path should include `why_relevant`, supporting evidence, source paths, and neighboring evidence that may matter.

### Graph Notes

Write these as Markdown under `.goodnight/skills/m-flow/`:

- `graph.md`: nodes and edges in readable form.
- `anchors.md`: source-to-facet/entity anchors.
- `path-index.md`: reusable path summaries and their costs.

## Retrieval Procedure

### 1. Route

Read the user's question and select candidate facets. Use source tags, file paths, titles, summaries, and recent user-selected files. If the user points at a file, pin that file as an anchor even if the base ranking is weak.

### 2. Narrow

Within each candidate facet, identify facet points that match the user's intent. A facet point can be a requirement, a bug report, a design decision, an implementation note, or a quoted fact.

### 3. Anchor

Map facet points to entities. Prefer concrete anchors over abstract labels:

- `src/modules/knowledge/systemIndexProject.ts` is better than `indexing`.
- `AIChat.tsx composer state` is better than `UI`.
- `manual refresh rebuild rule` is better than `workflow`.

### 4. Bundle

Pull neighboring episodes when they clarify ownership, sequence, contradiction, or causality. A good bundle is small but complete enough that the answer is understandable without opening ten unrelated files.

### 5. Score Path Cost

Prefer paths with:

- direct source evidence,
- fewer hops,
- newer sources when recency matters,
- stronger entity matches,
- less contradiction,
- clearer neighboring context.

Penalize paths with vague summaries, stale generated files, missing source paths, or weak keyword-only matches.
Apply M-Flow's key scoring rule: use the strongest path, not an average over all possible paths. One tight FacetPoint or Entity chain can make an Episode highly relevant even when other facets are irrelevant. Broad direct Episode matches are useful, but weaker than precise tip-level anchors when both exist.

### 6. Answer

Answer through the selected path. State why the evidence is related before citing isolated facts. If multiple paths disagree, name the disagreement instead of averaging it away.

## Generated Path Shape

Use this structure for path pages:

```markdown
# Evidence Path: <topic or source>

Question pattern: <what this path helps answer>
Path: question -> facet:<facet> -> facet-point:<point> -> entity:<entity> -> source:<path>
Path cost: low | medium | high

## Why Relevant

<Explain the semantic connection.>

## Evidence Bundle

- <claim or observation> Source: <path>
- <neighboring evidence> Source: <path>

## Related Paths

- <path or entity>

## Gaps

- <missing, stale, or uncertain evidence>
```

## Good Output

Good M-Flow output is:

- path-aware,
- explicit about why evidence is related,
- based on coherent bundles,
- anchored to entities and source paths,
- careful about stale generated outputs,
- able to say "this path is weak" when evidence is weak.

## Avoid

- Do not treat M-Flow as chunk-only retrieval.
- Do not regenerate a wiki for unchanged files.
- Do not ignore fresh user-selected files after a manual refresh.
- Do not let keyword overlap outrank a stronger semantic path.
- Do not hide path cost or uncertainty.
- Do not produce model-facing JSON or JSONL graph artifacts.

## When More Detail Is Needed

Read `references/m-flow-method.md` for graph terms, bundle search, path-cost scoring, and examples.
