# Project Filesystem Source-Of-Truth Design

## Summary

This design changes the project workspace from a mixed in-memory plus file-sync model into a filesystem-first model.

The new rule is simple:

- the project directory is the only persistent source of truth
- frontend state exists only for selection, editing, preview, and short-lived drafts
- creating, deleting, renaming, and generating artifacts are all real file operations

This design intentionally replaces earlier assumptions that `项目 / 草图 / 设计` are only logical UI groups. The UI may still present localized labels, but the underlying project structure becomes real and deterministic on disk.

## Goals

- Make project content behavior match real files and folders.
- Remove ambiguity between in-memory page state and disk state.
- Make sketch pages, style files, and generated HTML outputs understandable as ordinary project files.
- Keep future localization in the UI layer instead of encoding it into disk paths.
- Reduce sync bugs caused by derived files lagging behind transient state.

## Non-Goals

- No requirement to support arbitrary user-defined project layouts in the first version.
- No change to AI capability boundaries beyond reading from the new file-backed source model.
- No requirement to make every editor fully generic across all file types.
- No migration of all historic project data formats in one step if a smaller compatibility bridge works.

## Core Principles

- Filesystem is the only persistent source of truth.
- Real files must exist before the UI treats their content as project content.
- UI labels may be localized later, but disk paths stay stable and ASCII.
- Derived indexes or manifests may exist for performance, but they are caches, not source data.
- If a file is deleted on disk, the corresponding UI entity no longer exists.

## Project Directory Layout

Each project is initialized with this real directory structure:

```text
<project-root>/
  project/
  sketch/
    pages/
  design/
    prototypes/
    styles/
```

Path meanings:

- `project/`: requirement docs, notes, planning docs, and general markdown
- `sketch/pages/`: one markdown file per sketch page
- `design/styles/`: style source markdown files
- `design/prototypes/`: generated HTML prototype files

UI labels may still show `项目 / 草图 / 设计`, but disk paths remain English-only:

- `project`
- `sketch`
- `design`
- `prototypes`
- `styles`

## Project Creation

Creating a project must immediately create the real directory structure on disk.

Required initialization behavior:

- create `project/`
- create `sketch/pages/`
- create `design/prototypes/`
- create `design/styles/`
- write the built-in default style pack into `design/styles/`

Project creation must not inject fake in-memory starter documents that do not exist as files.

## File Semantics

### Project Documents

General project documents live in `project/`.

Examples:

- requirement markdown
- notes
- planning docs
- reference docs

Creating a project document means creating a real file in `project/` or one of its subfolders.

### Sketch Pages

Each sketch page is a real markdown file under `sketch/pages/`.

Rules:

- one sketch page maps to one `.md` file
- creating a sketch page means creating that file
- deleting a sketch page means deleting that file
- renaming a sketch page means renaming the file and updating the internal title

The UI may still render cards, trees, and a canvas editor, but those are views over the markdown file, not independent persisted entities.

### Style Files

Each design style is a real markdown file under `design/styles/`.

Rules:

- built-in styles are written during project initialization
- creating a style means creating a new `.md` file
- editing a style means updating the markdown file
- deleting a style means deleting the file unless it is protected built-in content

### Prototype Files

Each generated HTML output is a real file under `design/prototypes/`.

Rules:

- generating a new HTML page means creating a new `.html` file
- regenerating a page means overwriting the target `.html` file
- deleting a generated page means deleting the file

If a manifest or index is kept for convenience, it must be treated as a cache only.

## Frontend Behavior

### Knowledge Tree

The left knowledge tree should be built from real filesystem scanning results.

It should reflect real folders and files under the project root, while still allowing localized display labels and grouped presentation.

The tree should no longer pretend that content exists when no file exists on disk.

### Sketch Library

The sketch library should be built from `sketch/pages/*.md`.

Each sketch page entry should be parsed from file content and file metadata, such as:

- title
- summary or goal
- module definitions
- updated time

The sketch library should not use an independent page-structure store as its source of truth.

### Sketch Editor

Opening a sketch page means loading its markdown file.

Editing behavior:

- UI can keep a temporary local draft while the user is editing
- save writes back to the same markdown file
- the visual canvas is an editor for file content, not a second persisted model

### Design Workspace

The design workspace should consume real files:

- style list from `design/styles/*.md`
- HTML outputs from `design/prototypes/*.html`
- current sketch input from `sketch/pages/*.md`

Generating HTML should read the current sketch file plus selected style file, then write the target HTML file.

The design workspace is a visual orchestrator over files, not a separate durable data store.

## State Model Changes

Existing state should be narrowed to UI concerns.

### Must Remain UI State

- selected file
- expanded tree nodes
- search text
- current editor mode
- unsaved local draft text
- transient rendering or selection state

### Must Stop Being Persistent Truth

- sketch pages stored primarily as runtime page nodes
- wireframes stored as a separate long-lived source model
- generated design outputs stored primarily in memory
- requirement documents that exist in store but not on disk

### Allowed Derived Runtime Structures

Parsed structures are still allowed for rendering and tooling, for example:

- parsed sketch modules from markdown
- parsed style tokens from markdown
- parsed page metadata for cards or trees

But these structures must be derived from files and disposable.

## Existing Model Consolidation

The current store should be consolidated conceptually as follows:

- `requirementDocs` -> derived from files under `project/`
- `wireframes` -> derived from files under `sketch/pages/`
- `generatedFiles` -> derived from files under `design/prototypes/` and `design/styles/`
- `pageStructure` -> runtime parse result only, not source-of-truth state

Selection ids may still exist in memory, but only to track active UI state.

## File Operations

All core user actions must map directly to file operations.

### Create Project

- create folders
- write default style files

### Create Sketch Page

- create `sketch/pages/<stable-name>.md`

### Delete Sketch Page

- delete the corresponding markdown file

### Rename Sketch Page

- rename the markdown file
- update internal heading or metadata
- update path-based references if path identity is still used

### Create Project Doc

- create `project/<name>.md`

### Create Style

- create `design/styles/<name>.md`

### Generate Prototype

- create or overwrite `design/prototypes/<name>.html`

## Identity Strategy

The first version uses stable relative file paths as identity, since files are now the source of truth.

Recommended behavior:

- relative path is the primary id for selection and indexing
- if a future version requires rename-stable identity, add frontmatter ids in a later migration

This avoids inventing a second identity layer before it is necessary.

## AI Reference Model Impact

The AI reference system should consume the same file-backed model.

This aligns well with the already approved direction for file-based context indexing:

- reference files come from actual files on disk
- `current`, `directory`, and `all` scope operations resolve against real file sets
- sketch and style context are no longer transient-only UI artifacts

The `.ai/context-index.json` file may still exist, but it must be rebuilt from the real project directory.

## Migration Strategy

The migration should be incremental.

### First Step

- create the new physical directories for newly created projects
- stop seeding fake starter docs in memory
- keep current UI mostly intact while changing backing data to files

### Compatibility Bridge

For existing projects that still contain old in-memory snapshot data:

- read the old snapshot state
- materialize it into the new folder structure
- after materialization, prefer files over old store fields

### Deletion Of Old Truth Paths

Once the file-backed flow is stable:

- remove legacy assumptions that `pageStructure`, `wireframes`, or `generatedFiles` are primary truth
- keep only runtime parsed forms when still useful

## Error Handling

Filesystem failure should surface as explicit user-facing errors.

Examples:

- project initialization failed because a folder could not be created
- sketch page save failed because the file could not be written
- prototype generation failed because output path write failed

The UI must not silently preserve fake success state after a filesystem write failure.

## Testing Strategy

The most important tests are file-behavior tests.

Required coverage:

- project creation creates the expected directory tree
- project creation writes built-in style files
- creating a sketch page creates a markdown file
- deleting a sketch page removes the markdown file
- generating a prototype creates or overwrites an HTML file
- knowledge tree renders from the real directory structure
- sketch library entries come from `sketch/pages/*.md`
- stale UI state cannot outlive file deletion

## Superseded Assumptions

This design intentionally supersedes earlier assumptions in the same date range:

- `项目 / 草图 / 设计` are no longer only logical UI groups
- projects should no longer default to root-level loose files for new content
- sketch markdown should no longer be treated merely as a derived sync artifact from runtime page state

If older specs conflict with this document, this document wins for project file persistence and workspace truth ownership.

## Result

After this redesign:

- the project folder explains the project state by itself
- frontend views are easier to reason about because they render real files
- adding or removing sketch, style, and prototype content becomes predictable
- AI context selection and knowledge browsing align with the same file-backed model

This is the intended long-term persistence model for the workspace.
