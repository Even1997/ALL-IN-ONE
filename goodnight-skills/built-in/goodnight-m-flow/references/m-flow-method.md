# M-Flow Method Reference

## Upstream Design Interpreted For GoodNight

M-Flow is a graph-routed memory method. It avoids isolated chunk retrieval by constructing semantic paths from a query to evidence. GoodNight should preserve that idea even though its local runtime is file-based.

## Graph Vocabulary

- Episode: a source moment or note-level memory record.
- Facet: a broad relevance angle.
- FacetPoint: a concrete claim, observation, constraint, or decision within a facet.
- Entity: a concrete anchor such as a file, feature, module, workflow, person, or named concept.
- Path: the route that connects a question to evidence.
- Bundle: the small neighborhood of episodes and entities needed to answer coherently.

## Bundle Search

Bundle search should retrieve evidence neighborhoods, not single snippets. Add neighboring files when they explain:

- cause and effect,
- chronology,
- ownership,
- implementation detail,
- design rationale,
- test coverage,
- contradiction or drift.

Keep the bundle small. If more than five sources are needed, explain why.

## Path-Cost Scoring

Use low cost when the question maps directly to a facet point and entity with fresh source evidence.

Use medium cost when the answer needs neighboring episodes or when the source is indirect.

Use high cost when the path is mostly keyword overlap, old generated output, vague summaries, or missing source files.

## Markdown Graph Notes

`graph.md` should be readable without tooling:

```markdown
## Nodes
- facet:architecture
- facet-point:index rebuilds on manual refresh
- entity:systemIndexProject.ts
- episode:project/indexing-notes.md

## Edges
- facet:architecture -> facet-point:index rebuilds on manual refresh
- facet-point:index rebuilds on manual refresh -> entity:systemIndexProject.ts
- entity:systemIndexProject.ts -> episode:project/indexing-notes.md
```

## Answering Rules

- Name the selected path before relying on it.
- Cite source paths for factual claims.
- Mark weak paths instead of presenting them as certain.
- Prefer fresh user-selected files over stale generated artifacts.
- If two paths conflict, describe the conflict and ask whether to inspect more sources when needed.
