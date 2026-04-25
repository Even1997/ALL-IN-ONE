# Style Pack V1 Design

## Summary

This design introduces a unified `Style Pack` document format for visual themes.

The same format must work for:

- built-in styles maintained by the product
- user-defined styles described in text
- user-provided screenshots analyzed by AI
- hybrid styles produced from both text and image input

The output of all four flows is the same artifact:

- one style pack file
- one stable machine-readable token block
- one stable human-readable design explanation block

This turns style generation into a normalized pipeline instead of a free-form AI writing task.

## Goals

- Define one stable style-pack format that AI can generate reliably.
- Make style packs machine-parseable, validator-friendly, and reusable across sessions.
- Support built-in style libraries and user-generated styles with the same schema.
- Support screenshot-driven style inference without creating a separate format.
- Keep enough narrative explanation for human review and future AI reuse.
- Prevent schema drift by fixing field names, section names, and required structure.

## Non-Goals

- No attempt to identify exact commercial fonts from screenshots.
- No requirement to perfectly reverse-engineer a source UI from one image.
- No per-framework implementation tokens in v1 such as Tailwind class maps or React props.
- No multi-theme bundle format in one file.
- No free-form extension mechanism for arbitrary top-level keys in v1.

## Recommended Approach

Use a two-layer style-pack document:

1. frontmatter token contract
2. fixed markdown explanation sections

Why this approach:

- frontmatter gives the system stable data for parsing, validation, storage, and generation
- fixed markdown sections preserve design intent and reduce ambiguity during later AI use
- the same contract works for built-in presets and AI-generated custom packs
- screenshot inference can remain partially probabilistic without weakening the final file format

Rejected alternatives:

1. prose-only design style documents
   - readable by humans, but too unstable for generation and validation
2. JSON-only style documents
   - parseable, but too weak at preserving design rationale and review context
3. separate formats for built-in and user-generated styles
   - increases complexity and causes avoidable conversion logic

## Core Principle

AI may generate values, but it may not generate schema.

This means:

- field names are fixed
- section names are fixed
- enum values are constrained
- one file always represents one style pack

The system should tolerate uncertainty in values, especially for screenshot analysis, but it should not tolerate structural drift.

## File Model

Each style pack is stored as one markdown file:

- `design/styles/<style-id>.md`

Rules:

- one file contains exactly one style pack
- file name must match `id`
- the document contains one YAML frontmatter block followed by fixed markdown sections
- multiple style packs may not be combined into a single file

## Top-Level Structure

Each file has two parts:

### Part 1: Frontmatter

Purpose:

- machine-readable
- schema-validatable
- directly consumable by AI and product logic

### Part 2: Markdown Sections

Purpose:

- explain design intent
- document inferred vs explicit decisions
- give later AI runs stable narrative guidance
- support human review and editing

## Required Frontmatter Fields

The following top-level fields are required in v1:

- `id`
- `name`
- `version`
- `sourceType`
- `sourceDescription`
- `theme`
- `density`
- `contrast`
- `tags`
- `confidence`
- `colors`
- `typography`
- `rounded`
- `spacing`
- `effects`
- `motion`
- `components`

Suggested example:

```yaml
---
id: shonen-dynamic
name: Shonen Dynamic
version: 1
sourceType: builtin
sourceDescription: "Built-in ACG high-energy dark theme"
theme: dark
density: compact
contrast: high
tags:
  - acg
  - shonen
  - bold
  - glassmorphism
confidence: 1
colors: {}
typography: {}
rounded: {}
spacing: {}
effects: {}
motion: {}
components: {}
---
```

## Metadata Rules

### `id`

- lowercase kebab-case
- stable identifier used in storage and references
- must match the file name

### `name`

- human-readable display name

### `version`

- integer schema version
- v1 always uses `1`

### `sourceType`

Allowed values:

- `builtin`
- `user-text`
- `user-image`
- `hybrid`

Meaning:

- `builtin`: first-party style maintained by the product
- `user-text`: generated from user description only
- `user-image`: generated mainly from screenshot or image input
- `hybrid`: generated from both user description and image input

### `sourceDescription`

Short source summary describing where the style came from.

Examples:

- `Built-in dark ACG theme with orange/blue action palette`
- `Generated from user request for playful anime social UI`
- `Generated from screenshot of bright rounded neon anime app`

### `theme`

Allowed values:

- `dark`
- `light`

### `density`

Allowed values:

- `compact`
- `balanced`
- `spacious`

### `contrast`

Allowed values:

- `low`
- `medium`
- `high`

### `tags`

- free list of short descriptive labels
- should help retrieval, recommendation, and browsing

### `confidence`

- numeric confidence from `0` to `1`
- reflects how certain the generator is about the pack as a whole
- built-in styles should use `1`
- screenshot-generated styles may use lower confidence when exact details are inferred

## Token Groups

The token groups below are fixed in v1.

### `colors`

This group holds semantic color tokens rather than raw palette labels only.

Required direction:

- use semantic names such as `background`, `surface`, `primary`, `on-primary`
- prefer stable system-oriented roles over ad hoc labels like `pink-1` or `blue-deep`
- values must be hex colors

Recommended baseline includes:

- background and foreground pairs
- surface stack
- primary, secondary, tertiary pairs
- error pairs
- outline tokens

### `typography`

This group defines reusable type roles rather than page-specific text styles.

Recommended stable roles:

- `display-lg`
- `headline-lg`
- `headline-md`
- `body-lg`
- `body-md`
- `body-sm`
- `label-md`

Each role should define:

- `fontFamily`
- `fontSize`
- `fontWeight`
- `lineHeight`
- optional `letterSpacing`

The names should remain stable across all style packs. AI should not invent alternate role names such as `headline-xl` in one file and `display-xl` in another unless the schema is formally upgraded.

### `rounded`

This group defines shape radii.

Recommended keys:

- `sm`
- `DEFAULT`
- `md`
- `lg`
- `xl`
- `full`

### `spacing`

This group defines the spacing system.

Recommended keys:

- `unit`
- `xs`
- `sm`
- `md`
- `lg`
- `xl`
- `gutter`
- `margin-mobile`
- `margin-desktop`

The key set should stay stable across packs so AI can generate comparable outputs.

### `effects`

This group captures visual effects that otherwise get lost in prose.

Recommended keys:

- `border-width`
- `focus-ring-width`
- `shadow-color`
- `shadow-opacity`
- `shadow-blur`
- `glass-blur`
- `glass-opacity`

This is important because glow, blur, and border emphasis are often central to style identity.

### `motion`

This group captures reusable motion defaults.

Recommended keys:

- `duration-fast`
- `duration-normal`
- `duration-slow`
- `easing-standard`
- `easing-emphasized`
- `press-scale`

This allows AI-generated style packs to influence interaction feel, not just static appearance.

### `components`

This group captures component-level defaults for major recurring UI primitives.

Recommended baseline components:

- `button`
- `card`
- `chip`
- `input`
- `nav`

This layer should not try to encode full component implementation. It only records style defaults that help downstream UI generation.

## Fixed Markdown Sections

The markdown section titles are fixed in v1 and must appear in this order:

```md
## Brand & Style
## Colors
## Typography
## Layout & Spacing
## Elevation & Depth
## Shapes
## Motion
## Components
## Accessibility
## Do / Don't
```

Rules:

- AI may fill the content of each section
- AI may not rename, reorder, or omit these sections in v1
- these sections exist even if some sections are brief

## Source-Specific Generation Rules

### Built-In Styles

Built-in styles are the cleanest case.

Rules:

- must fully conform to schema
- should use `confidence: 1`
- should avoid ambiguous notes unless the pack is intentionally approximate

### User Text Styles

These are generated from user language such as:

- "make it look like a premium anime community app"
- "I want brighter colors, more rounded shapes, toy-like UI"

Rules:

- user intent should be summarized into `sourceDescription`
- vague requests should still be normalized into the fixed schema
- AI should infer missing values conservatively rather than expanding scope

### User Image Styles

These are generated from screenshots or visual references.

Rules:

- the resulting style pack still uses the same schema
- AI may infer approximate typography mood, but should not present unverified exact font identity as certain
- `confidence` should reflect uncertainty when key details are inferred
- the markdown narrative should note when specific decisions are inferred from image tone rather than directly observed

### Hybrid Styles

These combine text intent and image reference.

Rules:

- user text should define priority when text and image conflict
- the image should refine rather than overwrite explicit stated intent unless the product later defines a different priority rule

## Generation Pipeline

All style-pack creation flows should follow the same high-level pipeline:

1. ingest source input
2. extract style intent
3. map intent to fixed schema
4. write narrative explanation
5. validate
6. persist style pack

### Step 1: Ingest Source Input

Possible inputs:

- built-in template
- user prompt text
- one or more screenshots
- mixed text and image

### Step 2: Extract Style Intent

AI should normalize input into a style-intent layer before writing tokens.

Important dimensions include:

- mood
- energy
- color temperature
- contrast level
- density
- shape language
- depth model
- motion tendency
- component attitude

### Step 3: Map Intent To Schema

This is the critical normalization step.

Examples:

- "soft toy-like" -> larger radii, softer glow, spacious spacing
- "shonen action" -> higher contrast, sharper emphasis, brighter accent glow
- "frosted premium" -> stronger glass blur and restrained surface layering

At this step AI must not invent new top-level keys.

### Step 4: Write Narrative Explanation

The markdown body should explain:

- why the pack looks the way it does
- how colors, typography, motion, and components should be used
- which decisions are inferred rather than explicit

### Step 5: Validate

Validation should reject or repair structural errors before saving.

### Step 6: Persist

The final output is written as one style pack markdown file.

## Validation Rules

The system should validate at least the following:

- required top-level fields exist
- enum fields use allowed values
- `id` is kebab-case
- file name matches `id`
- color values are valid hex strings
- size values include units such as `px`, `rem`, or `em`
- required token groups exist
- fixed markdown section headers exist in the correct order

Validation should reject unknown top-level fields in v1 unless the schema version changes.

## AI Writing Constraints

To keep outputs stable, the generator should follow these rules:

- do not invent alternate top-level keys
- do not collapse multiple styles into one file
- do not use prose as a substitute for missing tokens
- do not pretend uncertain inferences are exact facts
- do not omit required sections because a style feels simple

The intended behavior is:

- structured where the system needs structure
- descriptive where explanation helps future reuse

## Storage And Retrieval

The style pack should be treated as a reusable project artifact.

Typical uses:

- built-in style library browsing
- user-saved custom styles
- reapplying a style to new pages
- using style packs as AI context for later UI generation
- comparing one style pack to another during refinement

Because all style sources normalize into the same file format, retrieval and reuse logic can stay simple.

## Why This Format

This format is intentionally stricter than a normal design note.

It is designed to be:

- writable by AI
- reviewable by humans
- parseable by product code
- reusable across built-in and generated flows

The key design choice is not the prose style. The key design choice is enforcing one stable contract that can survive repeated AI generation.

