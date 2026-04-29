---
name: goodnight-llmwiki
description: Use when GoodNight should transform local vault material into Karpathy-inspired LLMWiki Markdown pages, curated topic maps, durable indexes, and citation-ready reference summaries without mutating user originals.
---

# GoodNight LLMWiki

## Design Intent

Use `llmwiki` when the user wants durable knowledge distillation, not just retrieval. The upstream pattern is a compiler-like loop:

1. Ingest raw source material into stable Markdown captures.
2. Compile those captures into concise wiki pages.
3. Query the wiki first, then fall back to raw captures and source notes.
4. Lint the generated wiki for drift, missing citations, duplicate concepts, and stale pages.

GoodNight adapts that loop to a local vault. The user's notes stay untouched. Generated artifacts live under `_goodnight/outputs/llmwiki/`; build notes live under `.goodnight/skills/llmwiki/`.

This intentionally mirrors `Astro-Han/karpathy-llm-wiki`: use `raw/` for immutable source material, `wiki/` for compiled knowledge articles, `wiki/index.md` for the global table of contents, and `wiki/log.md` for append-only operations.

## Mental Model

- Treat `raw/` as source-preserving snapshots. They are not essays; they retain enough source context for later verification.
- Treat `wiki/` as maintained knowledge pages. They should be short, linked, titled, and stable enough to answer future questions.
- Treat `index.md` as the navigation surface. It should make the wiki searchable by topic, source, status, and update time.
- Treat `log.md` and `.goodnight/skills/llmwiki/manifest.md` as the build record. They explain what changed and what was skipped.
- Prefer Markdown over JSON for every model-facing artifact. JSON belongs to the base index internals only.

## Operating Modes

### Ingest

Run ingest when a manual refresh happens, when the user asks to rebuild LLMWiki pages, or when a selected source has changed.

1. Read `.goodnight/base-index/manifest.json` to understand build time, source count, and fingerprint.
2. Read `.goodnight/base-index/sources.json` and relevant chunks from `.goodnight/base-index/chunks.jsonl`.
3. Skip prior runtime outputs under `_goodnight/outputs/` and `.goodnight/skills/`.
4. Write one Markdown raw capture per source:
   - path: `_goodnight/outputs/llmwiki/raw/<source-slug>.md`
   - title: `# Raw: <source title>`
   - include source path, source kind, tags, summary, selected excerpts, and chunk ids when available.
5. Record skipped, changed, and generated sources in `.goodnight/skills/llmwiki/manifest.md`.

### Compile

Run compile after ingest or when the user asks for a wiki-style knowledge base.

1. Read each relevant raw capture.
2. Create or update `_goodnight/outputs/llmwiki/wiki/<topic-slug>.md`.
3. Merge related source captures into one topic page when that improves future retrieval.
4. Keep each wiki page focused on one concept, decision, workflow, glossary entry, or question cluster.
5. Preserve source traceability. Every important claim should include source paths or raw capture links.
6. Rebuild `_goodnight/outputs/llmwiki/index.md` and append to `_goodnight/outputs/llmwiki/log.md`.

### Query

Run query when the user asks a knowledge question and the selected retrieval method is `llmwiki`.

1. Search `index.md` and relevant `wiki/*.md` pages first.
2. If a wiki page is thin or outdated, inspect its matching `raw/*.md` capture.
3. If raw capture is insufficient, fall back to `.goodnight/base-index/` and then to the original vault file.
4. Answer from the stable wiki page when possible, but cite the original source path or raw capture when making factual claims.
5. If the wiki cannot support the answer, say what is missing and suggest a refresh or page creation.

### Lint

Run lint after compile or before trusting a large wiki answer.

Check for:

- orphan raw captures with no wiki page,
- wiki pages with no source path,
- duplicate pages about the same concept,
- stale pages whose source fingerprint changed,
- claims without source traceability,
- pages that read like chat transcripts instead of reference material.

## Wiki Page Shape

Use this page structure unless the user's source demands a better one:

```markdown
# <Concept or Decision>

Status: draft | stable | stale
Sources:
- <source path>
- <raw capture path>

## Summary

<3-6 sentence stable explanation.>

## Key Points

- <claim> Source: <path>
- <claim> Source: <path>

## Related Concepts

- [[other-topic]]

## Open Questions

- <missing or uncertain point>
```

## Index Shape

Keep `_goodnight/outputs/llmwiki/index.md` useful for humans and agents:

```markdown
# LLMWiki Index

Built at: <timestamp>
Fingerprint: <base-index fingerprint>

## Stable Pages

- [Topic](wiki/topic.md) - short summary

## Source Coverage

- source/path.md -> raw/source-path.md -> wiki/topic.md

## Needs Review

- page or source requiring refresh
```

## Good Output

Good LLMWiki output is:

- compact enough to scan,
- explicit about sources,
- written as reference-style Markdown rather than chat transcript,
- stable across repeated questions,
- organized by concepts rather than file order,
- written in Markdown that can be read directly,
- conservative about uncertain claims.

## Avoid

- Do not overwrite user notes.
- Do not treat LLMWiki as the default mode for every question.
- Do not rebuild pages for unchanged documents unless requested.
- Do not emit model-facing JSON for raw captures, wiki pages, manifests, or logs.
- Do not hide uncertainty by turning weak notes into polished-sounding facts.
- Do not copy long source passages when a short sourced summary is enough.

## When More Detail Is Needed

Read:

- `references/raw-template.md` for raw capture format.
- `references/article-template.md` for compiled article format.
- `references/index-template.md` for index format.
- `references/archive-template.md` when saving a query answer back into the wiki.
- `references/llmwiki-method.md` for the adapted workflow, page taxonomy, and quality checks.
