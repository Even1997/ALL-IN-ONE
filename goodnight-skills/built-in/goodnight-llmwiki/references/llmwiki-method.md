# LLMWiki Method Reference

## Upstream Design Interpreted For GoodNight

The LLMWiki pattern treats a knowledge base as a generated wiki with a reproducible build loop. GoodNight should not merely retrieve chunks; it should curate source material into pages that become better answer surfaces over time.

## Artifact Roles

### Raw Captures

Raw captures are Markdown records of source files. They should preserve the source path, summary, representative excerpts, tags, and chunk identifiers. They are useful when the wiki page is too compressed.

### Wiki Pages

Wiki pages are the primary model-facing knowledge surface. They group material by concept rather than by original file. A page can cite multiple raw captures when several notes discuss the same idea.

### Index

The index is both navigation and coverage reporting. It should show stable pages, pages needing review, and the mapping from source files to generated pages.

### Log And Manifest

The log explains the latest build in chronological form. The manifest explains what sources were included, skipped, or marked stale. Both should be Markdown so an agent can read them without decoding a private schema.

## Compilation Heuristics

- Merge sources when they answer the same durable question.
- Split pages when a source contains multiple durable concepts.
- Prefer a stable concept title over the original file name.
- Keep glossary, decision, workflow, and topic pages separate when possible.
- Use an "Open Questions" section instead of inventing missing details.

## Query Heuristics

- Answer from `wiki/` first.
- Use `raw/` to verify compressed claims.
- Use `.goodnight/m-flow/` only when generated pages are missing or stale.
- Cite source paths in user-facing answers when the claim depends on a local document.

## Lint Checklist

- Every wiki page has at least one source path.
- Every important source has either a wiki page or a stated skip reason.
- Similar titles are not duplicates.
- Stale pages are marked before they are trusted.
- Long quotations are avoided unless the user explicitly asks for exact wording.
