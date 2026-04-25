# AI Chat Context Index And Reference Scope Design

## Summary

This design replaces the current hard-coded AI knowledge selection model with a file-oriented reference system.

The core rule becomes:

- users choose files
- AI reads only the selected file boundary
- `引用当前` / `引用目录` / `引用全部` are shortcut operations for building that selected file set

The system will maintain a project-local context index file that records available reference files, summaries, grouping, and relationships. AI chat will no longer assume that only requirement docs or generated HTML are readable. Instead, requirement docs, planning markdown, sketch markdown, style markdown, HTML prototypes, and future project files all participate through the same reference-file model.

When the selected context is too large, the system should not blindly concatenate raw content. It should first provide AI with a directory-style index and then expand only the files that are relevant.

## Goals

- Make AI readable scope explicitly controlled by user-selected files.
- Unify project docs, sketch docs, design docs, and generated outputs under one reference-file abstraction.
- Allow chat input to quickly select references through `引用当前`, `引用目录`, and `引用全部`.
- Keep project organization simple: folders are management structure, not AI permission rules.
- Introduce a system-maintained context index that supports summaries and file relationships.
- Support automatic context compression when selected content is too large.

## Non-Goals

- No user-editable system index in the first version.
- No full IDE-style semantic retrieval or vector database.
- No complex per-file permission system.
- No redesign of the existing main editor beyond what is needed for reference selection.
- No requirement that logical groups such as `项目 / 草图 / 设计` must physically exist as folders on disk.

## Core Principles

- Files are the source of truth for AI reference boundaries.
- Reference scope is chosen by the user, not inferred from hard-coded file categories.
- Folder grouping is organizational, not a hidden access rule.
- System-generated summaries and relationships should reduce prompt size without changing source content.
- When context grows too large, the system should degrade gracefully through indexing and summarization before truncation.

## Current Problem

The current AI chat path reads from a narrow set of sources:

- `requirementDocs`
- some `generatedFiles`, mainly generated HTML

This causes several gaps:

- generated markdown planning files such as `wireframes.md` and `features.md` are not treated as chat-readable knowledge
- current page sketch markdown is often only computed in UI state and not represented as a stable reference file
- current style markdown is also computed transiently and cannot be selected as a durable AI-readable file
- reference behavior differs by scene, making the user model unclear

The result is that users cannot reliably say "these files are the AI boundary" and trust that the chat input follows that rule.

## User Experience

### Chat Reference Model

The effective AI context is `已选文件`.

This is the only boundary that ultimately matters for AI chat. The UI may present it as chips, a compact list, or another lightweight selection surface near the composer.

### Reference Scope Shortcuts

The chat area exposes three shortcut actions:

- `引用当前`
- `引用目录`
- `引用全部`

These do not directly mean "AI reads current" or "AI reads all". They are batch operations that set or rebuild `已选文件`.

Recommended first-version behavior:

- `引用当前`: replace the selected file set with the file or file set that corresponds to the current focused content
- `引用目录`: replace the selected file set with all AI-readable files inside a chosen directory
- `引用全部`: replace the selected file set with all AI-readable files in the project

Users can then manually remove or add files in the selected-file set.

### Meaning Of Current

`当前` must resolve to stable reference files rather than temporary UI text.

Examples:

- active requirement doc -> one reference file
- selected sketch page -> one sketch markdown reference file
- selected style node -> one style markdown reference file
- selected HTML prototype page -> one HTML reference file

If the UI can display the content but the system cannot map it to a stable reference file id and path, then `引用当前` is not complete.

## Unified Reference File Model

The system should introduce a normalized reference-file abstraction consumed by chat, knowledge views, and context indexing.

Each reference file should carry at least:

- `id`
- `path`
- `title`
- `content`
- `type`
- `group`
- `source`
- `updatedAt`
- `readableByAI`
- `summary`
- `relatedIds`
- `tags`

Suggested shape:

```ts
type ReferenceFile = {
  id: string;
  path: string;
  title: string;
  content: string;
  type: 'md' | 'html' | 'json' | 'txt';
  group: 'project' | 'sketch' | 'design';
  source: 'user' | 'ai' | 'derived';
  updatedAt: string;
  readableByAI: boolean;
  summary: string;
  relatedIds: string[];
  tags: string[];
};
```

## File Sources

### Requirement Docs

Existing `requirementDocs` map directly into reference files.

### Generated Files

Existing `generatedFiles` should no longer be filtered down to HTML only for chat purposes. Markdown design and planning outputs should also become reference files when `readableByAI` is true.

### Derived Sketch Markdown

Current page sketch/module markdown must be promoted from transient UI output into deterministic derived files, for example:

- `sketch/pages/<page-slug>.md`

These derived files can still be regenerated from source state, but they need stable ids and paths.

### Derived Style Markdown

Current style markdown must also become a deterministic derived file, for example:

- `design/styles/<style-slug>.md`

### HTML Prototypes

Generated HTML prototype pages already fit the model and should remain stable reference files, for example:

- `design/prototypes/<page>.html`

## System Context Index

The project should maintain an internal context index file such as:

- `.ai/context-index.json`

This file is system-managed and not intended for direct user editing.

Its responsibilities are:

- list all AI-readable reference files
- store summaries and metadata used for prompt compression
- store relationship hints across files

Suggested minimal structure:

```json
{
  "version": 1,
  "updatedAt": "2026-04-25T12:00:00.000Z",
  "groups": [
    { "id": "project", "label": "项目" },
    { "id": "sketch", "label": "草图" },
    { "id": "design", "label": "设计" }
  ],
  "files": [
    {
      "id": "sketch:pages/login.md",
      "path": "sketch/pages/login.md",
      "title": "登录页草图",
      "type": "md",
      "group": "sketch",
      "source": "derived",
      "summary": "登录页包含品牌头图、手机号输入、验证码、主按钮",
      "tags": ["login", "wireframe"],
      "relatedIds": ["design:styles/default.md", "design:prototypes/login.html"],
      "updatedAt": "2026-04-25T12:00:00.000Z",
      "readableByAI": true
    }
  ]
}
```

## Relationship Building

The index should track lightweight relationships so that AI can reason across artifacts without loading all content at once.

Examples:

- requirement doc -> related sketch pages
- sketch page -> related style markdown
- sketch page -> related HTML prototype
- generated design file -> related requirement or source page

Relationships can initially be built from existing ids and metadata:

- page ids
- source requirement ids
- related requirement ids
- feature links
- generated file paths

The first version does not need semantic inference beyond simple deterministic linking.

## Automatic Organization

The system should support two forms of organization:

### Passive Incremental Refresh

Whenever source content changes, the system updates the in-memory reference-file collection and refreshes the context index metadata needed for chat.

### Explicit `@整理`

When the user invokes `@整理`, the system performs a stronger normalization pass:

- rebuild the full context index
- refresh summaries
- refresh relationship links
- normalize group placement and metadata where needed

This command is an explicit "reorganize and refresh AI context metadata" action, not a user-authored content edit flow.

## Context Delivery Strategy

### Rule

Do not send all selected file content directly to AI by default.

Instead, use a staged prompt assembly flow.

### Stage 1: Directory-Style Index

Send AI a compact index of the selected boundary, including:

- path
- type
- title
- summary
- group
- updatedAt
- size hint

This gives AI a view of the available context without loading every file body.

### Stage 2: On-Demand Expansion

If the task needs more detail, the system expands only the relevant files into raw content or richer per-file summaries.

This is an application-level orchestration step. AI is not literally reading files from disk by itself. The host application provides the next file contents when needed.

### Stage 3: Automatic Compression

If the chosen boundary is still too large:

- prefer summaries over raw bodies
- preserve structure over freeform truncation
- include a compact multi-file overview
- include only the most relevant raw excerpts for very large files

## Compression Rules

### Markdown

When compressing markdown:

- keep heading structure
- keep bullet hierarchy
- keep conclusion sections
- keep code block labels when relevant
- add a short summary if needed

### HTML

When compressing HTML:

- extract title
- extract main sections
- extract key text content
- extract interaction and layout hints
- avoid sending full markup unless necessary

### Sketch And Style Derived Files

When compressing sketch or style files:

- preserve layout modules
- preserve visual keywords
- preserve palette and typography information
- preserve interaction intent

## Grouping And File Management

The existing `项目 / 草图 / 设计` grouping should remain as a management view, but no longer decides AI readability by itself.

A file becomes AI-readable because:

- it exists in the unified reference-file collection
- it is marked `readableByAI`
- the user includes it in the selected file set

This avoids repeated category-specific logic inside chat.

## Component-Level Design

### Reference File Builder

Introduce a builder in `src/modules/knowledge` or a nearby shared module that converts:

- `requirementDocs`
- `generatedFiles`
- derived sketch markdown
- derived style markdown
- HTML prototypes

into one `ReferenceFile[]`.

### Context Index Builder

Introduce a builder that turns `ReferenceFile[]` into the serialized context index document and its in-memory lookup helpers.

### Chat Reference State

AI chat state should store selected reference file ids rather than relying only on:

- `activeKnowledgeFileId`
- `selectedKnowledgeContextIds`

Those existing fields may remain temporarily for compatibility, but the chat composer should move toward a file-id-based reference state.

### Prompt Assembly

Replace the direct "concatenate selected knowledge entries" flow with:

1. resolve selected reference files
2. build compact index view
3. decide expansion set
4. build final prompt payload

## Migration Strategy

The first implementation should be additive and surgical.

- Keep existing project store structures.
- Add a new reference-file conversion layer above current stores.
- Continue rendering knowledge and design views from current project state.
- Migrate AI chat to the new reference-file selection model first.
- Expand other consumers later if needed.

This avoids a large storage refactor while still changing the user-facing AI boundary behavior.

## Error Handling

- If a transient UI artifact cannot be normalized into a stable reference file, block `引用当前` for that artifact rather than silently sending incomplete content.
- If index generation fails, fall back to direct selected-file summaries instead of disabling chat.
- If relationship generation fails for a file, keep the file readable and leave `relatedIds` empty.
- If a selected directory contains no AI-readable files, show a direct empty-state error and keep the previous selection unchanged.

## Testing Strategy

The implementation should verify:

- unified reference-file conversion includes generated markdown as well as HTML
- derived sketch markdown and style markdown get stable ids and paths
- chat shortcut actions build the correct selected-file set
- directory selection expands to all readable files in that directory
- context index generation preserves summaries and relationships
- prompt assembly prefers index-first expansion rather than raw concatenation
- compression still preserves useful structure for markdown and HTML

## Open Questions Resolved In This Design

- AI boundary is controlled by selected files, not hard-coded knowledge categories.
- `引用目录` selects the whole directory and does not support per-file filtering in the directory picker flow.
- `引用当前` can resolve to multiple files when the current surface logically depends on multiple stable files.
- When context is too large, the system should automatically organize and compress rather than exposing raw token-management details in the chat UI.

## Recommendation

Implement this in three phases after planning:

1. build unified reference files and derived sketch/style files
2. add context index generation and index-first prompt assembly
3. replace chat composer reference controls with selected-file plus shortcut actions

This sequence keeps the storage model stable while moving AI chat onto the correct boundary model.
