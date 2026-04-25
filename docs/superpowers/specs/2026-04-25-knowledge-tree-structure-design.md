# Knowledge Tree Structure Design

## Summary

This design reshapes the product knowledge base into a simpler tree-oriented experience that is easier to scan and understand.

The left knowledge panel will no longer behave like a flat card list or an IDE-style boxy explorer. Instead, it will present three fixed top-level system groups:

- `项目`
- `草图`
- `设计`

These groups are UI-level organization nodes, not mandatory physical folders on disk. Inside each group, the UI will render a lightweight text tree built from real project files and user-created real folders.

Users will create new files in the project root directory by default. They can also create and delete real folders, including non-empty folders, from the knowledge tree via right-click actions. The three system groups themselves cannot be deleted.

## Goals

- Make the knowledge base easier to read through a minimal text tree UI.
- Replace the current box-heavy knowledge list with a hierarchy users can understand at a glance.
- Keep file operations grounded in the real project directory.
- Preserve simple default behavior: new files go to the project root.
- Support user-created real folders inside the knowledge base.
- Allow right-click file and folder operations without turning the UI into a heavy file manager.
- Keep the three top-level system groups protected and always visible.

## Non-Goals

- No requirement to physically create `项目`, `草图`, or `设计` directories on disk.
- No automatic folder restructuring in the first version.
- No automatic AI file moving during the initial save flow.
- No redesign of the main file editor beyond what is needed to support the new tree.
- No attempt to make the knowledge base a full general-purpose IDE explorer.

## Core Principles

- Organization should be obvious before it is powerful.
- Real files and folders should remain the source of truth for persistence.
- UI grouping and disk structure are allowed to differ.
- Default actions should be simple; advanced organization can happen later.
- Destructive operations should be possible, but explicit and protected.

## Information Architecture

### Top-Level Tree

The left knowledge panel has exactly three top-level system nodes:

- `项目`
- `草图`
- `设计`

These nodes are always visible, always rendered first, and cannot be renamed or deleted.

### Group Semantics

The system groups are logical buckets used for navigation:

- `项目`: general project knowledge, requirements, notes, planning, and regular markdown files
- `草图`: markdown documents classified as sketch material
- `设计`: generated HTML design files and future design-related outputs

### Group Contents

Each system group contains a nested text tree of real files and real folders.

The tree may include:

- files stored directly in the project root
- files inside user-created subfolders
- folders created by the user from the knowledge tree

The groups do not require that files live inside matching physical directories. Classification into a group is based on file metadata and file type, while persistence still points to the real project path.

## Classification Rules

### Project Group

A file belongs to `项目` when it is standard project knowledge content, including:

- requirement markdown
- note markdown
- planning markdown
- uncategorized project documentation

### Sketch Group

A file belongs to `草图` when it is identified as sketch content, primarily:

- requirement docs with `kind === "sketch"`
- markdown files explicitly marked or recognized as sketch assets

### Design Group

A file belongs to `设计` when it is a generated or design-oriented artifact, including:

- HTML design previews
- future design deliverables tied to sketch or UI output

## Persistence Rules

### New File Creation

Default rule:

- new knowledge files are created in the project root directory

If the user currently selects a real folder node before creating a file:

- the new file is created inside that folder

This preserves the simple default while still supporting deliberate folder organization.

### New Folder Creation

Users can create real folders from the knowledge tree.

If the user creates a folder from:

- a system group node, the folder is created in the project root
- a real folder node, the folder is created inside that folder

### Existing Files

Existing files with real paths remain stored where they are and are only re-rendered into the new logical group tree.

### Entries Without Real Paths

Knowledge entries without a real file path must be normalized into real project files before they fully participate in the new tree behavior.

The implementation should prefer a deterministic root-level file path for these items so the UI and disk state remain consistent.

## Interaction Design

### Tree Presentation

The tree should look like a lightweight document navigator, not a pill-based card list.

Expected visual rules:

- text-first rows
- indentation for hierarchy
- small expand/collapse affordances
- lightweight hover and selected states
- minimal metadata in the tree row
- no large `FILE` or `DIR` badges
- no heavy block backgrounds for every item

### Selection

Selecting a file opens it in the existing main content area.

Selecting a folder:

- expands or collapses the folder
- does not replace the main editor with unrelated content unless a dedicated folder state already exists

### Right-Click Menu

The tree supports right-click actions.

On system group nodes:

- new file
- new folder
- refresh

On real folder nodes:

- new file
- new folder
- rename (optional for first pass)
- delete

On file nodes:

- open
- rename (optional for first pass)
- delete
- copy path (optional if already present)

### System Group Protection

The three system groups:

- cannot be deleted
- cannot be renamed
- cannot be moved

They act as permanent navigation anchors.

## Delete Rules

### File Delete

Regular files may be deleted through the tree.

### Folder Delete

User-created folders may be deleted even when they are non-empty.

Because this is destructive, non-empty folder deletion must require confirmation that clearly states:

- the folder name
- that nested files and subfolders will also be deleted

### System Group Delete

Deleting `项目`, `草图`, or `设计` is not allowed.

The UI should hide the delete action for those nodes or replace it with a disabled protected state.

## Component-Level Design

### Knowledge Tree Model

The implementation should introduce or adapt a tree model that supports two node layers:

1. fixed logical group nodes
2. real file-system-backed folder and file nodes inside each group

Each node should carry:

- stable id
- display label
- node type
- real path when applicable
- logical group
- children
- expanded state where relevant
- protection flag for system nodes

### Product Workbench Integration

The knowledge panel in `ProductWorkbench` should stop rendering a flat filtered list for the left knowledge navigation and instead render the grouped tree.

The existing content-opening behavior should stay intact:

- click file -> open content
- keep markdown editing and HTML preview behavior

### File Operations Integration

The current file operations should be extended so that knowledge actions can:

- create files in the root or selected folder
- create folders in the root or selected folder
- delete files
- delete folders recursively after confirmation

## Error Handling

The first version should keep this simple and explicit.

- If a file or folder operation fails, show a direct error message.
- If a folder cannot be deleted, keep the current tree state unchanged.
- If classification fails, place the file in `项目` rather than hiding it.
- If a protected node receives a destructive action attempt, block it immediately in the UI.

## Testing Strategy

Verification should cover at least:

- the left panel renders the three fixed system groups
- system groups cannot be deleted
- root-level files appear in the correct group
- real nested folders render as a tree under the correct group
- expand/collapse works for folders
- creating a file from a group creates it in the project root
- creating a file from a real folder creates it inside that folder
- creating a folder from a group creates a real root-level folder
- deleting an empty folder works
- deleting a non-empty folder requires confirmation and deletes recursively after confirmation
- clicking a file still opens the correct markdown or HTML content
- the tree styling is visually lightweight compared with the current card-like list

## Open Decisions Resolved In This Design

- Top-level organization uses three logical system groups, not a raw disk tree.
- New files default to the project root.
- Users can create real folders.
- Users can delete non-empty user-created folders after confirmation.
- Right-click is the primary secondary action surface.
- The three system groups are protected and cannot be deleted.

## Recommended Implementation Sequence

1. Build grouped tree data from current knowledge entries and real paths.
2. Replace the flat knowledge list UI with the grouped text tree.
3. Add root and nested folder creation.
4. Add protected delete behavior for files and folders.
5. Add recursive delete confirmation for non-empty folders.
6. Verify file open, edit, and preview flows still work.
