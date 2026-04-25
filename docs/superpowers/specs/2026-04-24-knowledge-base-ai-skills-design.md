# Knowledge Base AI Skills Design

## Summary

This design changes the current product view from a requirement-only workspace into a knowledge-base-first workspace. Product managers maintain project files in a single place, then invoke AI capabilities on demand with `@skills` such as `@整理知识` and `@UI设计`.

The design keeps the existing workflow engine, page canvas, and design role view, but changes their relationship:

- The product tab becomes a knowledge base tab.
- Markdown sketch files remain the source of truth for sketch content.
- Design output is a one-way derivative of the selected sketch markdown.
- AI is no longer treated as a mandatory visible process. Users work freely and opt into guided skills only when needed.

## Goals

- Turn the current requirement area into a project knowledge base that can hold markdown notes, sketches, and generated design assets.
- Keep sketch markdown as the source asset for design work.
- Support explicit `@skill` invocation without forcing every task through one linear workflow.
- Allow AI to work on the current file plus related files selected from the knowledge base.
- Record one-way derivation from sketch markdown to generated design HTML assets.
- Let AI auto-suggest summaries, tags, and related files while requiring confirmation for structural changes.

## Non-Goals

- No MCP dependency for the first version.
- No bidirectional sync from generated design files back into sketch markdown.
- No full Obsidian clone with plugins or advanced graph editing.
- No replacement of the existing workflow engine.
- No automatic file moves, merges, or folder restructuring without confirmation.

## Product Principles

- The knowledge base is the default workspace.
- AI is a capability layer on top of project files, not a forced process UI.
- `@skills` are explicit and optional.
- Skill work can be guided, but guidance begins only after the user invokes a skill.
- All important assets stay inside the project knowledge base.

## Information Architecture

### Product Tab

The current requirement tab becomes a knowledge base tab:

- Left rail: knowledge file list and page list
- Main area: selected file viewer/editor
- Bottom AI input: reused unified AI entry
- Right-side AI/status rail: reused existing AI shell

### Knowledge Base

The knowledge base holds first-version file types:

- Markdown notes and requirement docs
- Markdown sketch docs
- Generated HTML design assets

Each file can expose lightweight metadata:

- summary
- tags
- related files
- derived-from source

### Design Workspace

The existing design page remains the dedicated execution workspace for design tasks. It does not replace the knowledge base. Instead it consumes a selected sketch source and optional related files, then produces design assets that return to the knowledge base.

## Interaction Model

### Everyday Knowledge Work

Users spend most of their time in the knowledge base:

- open markdown files
- edit notes or sketch content
- review generated HTML outputs
- ask AI to summarize or organize a file

### Skill Invocation

Users explicitly invoke skills in the bottom AI input:

- `@整理知识`
- `@草图`
- `@UI设计`

Default mode is lightweight. AI reads the selected file and related context, asks only when needed, and produces output. Users can still continue in a guided step-by-step way after the skill starts.

### Context Selection

The default AI context is:

- current file
- AI-suggested related files

Users can adjust the selected context from the knowledge base UI. The chosen files must be visible before they are sent to AI.

## Knowledge Model

### File Types

First version supports a lightweight file model:

- markdown knowledge files
- html generated design files

### Relationships

First version supports lightweight relationships only:

- `related_to`
- `derived_from`

The system should use them for display and prompt construction, not as a heavy graph editor.

### Automation Boundary

AI may automatically:

- generate summaries
- suggest tags
- suggest related files
- record derived-from relationships on generated outputs

AI must not automatically:

- rename files
- move files
- merge files
- archive files
- restructure folders

Those actions require explicit confirmation.

## Sketch To Design Rules

### Source Of Truth

Sketch markdown remains the source asset. Users effectively choose a sketch by choosing a markdown file.

### Design Derivation

Design output is one-way derived from the selected sketch markdown.

AI must preserve:

- content modules
- module order
- page hierarchy
- layout semantics

AI may reinterpret:

- exact x/y positions
- exact width and height
- detailed visual styling

This means design can be visually improved without violating the sketch structure.

### Output Location

Generated design output is saved as HTML design assets and returned to the knowledge base with derivation metadata pointing back to the sketch markdown source.

## Implementation Boundaries

### Existing ProductWorkbench

Reuse the current markdown editing and page workbench structure. Rename the requirement-facing UI to knowledge-base language and add generated HTML files to the visible file list.

### Existing AIChat

Reuse the current bottom AI shell as the unified entry. Add explicit `@skill` routing and knowledge-context awareness instead of building a second AI surface.

### Existing Workflow Engine

Keep the existing workflow engine but stop treating it as the only visible product interaction model. Use it as an execution backend after the user invokes a relevant skill or package.

## Verification

The first version is successful when:

- Users can browse project markdown and generated HTML assets from one knowledge-base entry.
- A markdown sketch can be chosen as the active source for design work.
- `@UI设计` can use the selected sketch and related context as AI input.
- Generated HTML outputs appear back in the knowledge base with a source relationship.
- AI context can include the current file and related files instead of only the raw project brief.
