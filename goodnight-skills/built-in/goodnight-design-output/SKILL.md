---
name: goodnight-design-output
description: Use when the user is working in Design Zone and the AI must produce concrete design-system or prototype outputs that map to GoodNight design files.
---

# GoodNight Design Output

## Overview

This skill turns design requests into file-ready GoodNight artifacts. Favor explicit structure, tokens, states, and prototype intent over vague visual commentary.

## Default Targets

- `design/styles/*.md` for design language, style packs, and reusable UI direction
- `design/prototypes/*` for prototype HTML and related manifest files
- visible vault design files for any optional summaries that should stay paired with the design work instead of overwriting source files

## File Naming Rules

- Style output should default to `design/styles/<style-slug>.md`.
- Prototype output should default to `design/prototypes/<page-slug>.html`.
- If you also produce a prose spec, keep it clearly paired to the prototype target instead of inventing an unrelated filename.

## Output Modes

This skill has two default output contracts:

- `style-output.md`
  For design language, style rules, tokens, and component conventions.
- `prototype-output.md`
  For page-level prototype spec that can later drive `design/prototypes/*`.

Do not mix both into an unstructured answer. Pick one primary output, or output both as two clearly separated documents.

## Style Output Rules

When producing `style-output.md`, use this section order:

```md
# style-output.md

## Visual Direction

## Design Tokens

## Typography

## Spacing And Radius

## Component Patterns

## Motion

## Usage Notes
```

### Style File Requirements

- `## Visual Direction`
  Describe the intended look in concrete product terms.
- `## Design Tokens`
  Required. Include color, surface, text, border, and accent tokens.
- `## Typography`
  Required. Include heading and body usage.
- `## Spacing And Radius`
  Required. Include spacing rhythm and corner system.
- `## Component Patterns`
  Required. Describe cards, buttons, inputs, navigation, or other relevant UI primitives.
- `## Motion`
  Required when interaction or transitions matter.

If the prompt is broad, still resolve it into concrete tokens instead of staying purely conceptual.

## Prototype Output Rules

When producing `prototype-output.md`, use this section order:

```md
# prototype-output.md

## Prototype Spec

## Page Identity

## Layout Structure

## Visual Direction

## Design Tokens

## States And Interactions

## Responsive Behavior

## Output Files
```

### Prototype File Requirements

- `## Prototype Spec`
  Use this section to summarize what this prototype is trying to prove or validate.
- Tie each prototype to a page or route.
- Use sketch structure as input when it exists.
- Describe key states and interactions.
- Include responsive behavior, not just desktop assumptions.
- `## Output Files`
  Must name the target file path, for example under `design/prototypes/`.

## Token Rules

- Always name the token groups you are defining.
- Prefer explicit token names over vague phrases.
- If a token already exists in `design/styles/*.md`, reuse or extend it instead of silently inventing a conflicting variant.
- Prefer kebab-case token names.
- Default examples:
  - `color-bg-page`
  - `font-heading-primary`
  - `space-16`
  - `radius-card`

## What To Avoid

- Do not stop at adjectives such as "modern" or "premium".
- Do not generate a prototype with no route or page context when that context can be inferred.
- Do not mix unfinished sketch structure with final design claims without saying what is still provisional.
- Do not write design output into user original knowledge notes when a new design artifact would be clearer.

## Minimal Design Checklist

Before finalizing a design artifact, make sure it answers:

1. What page or component is this for?
2. Which files should be created or updated?
3. Which tokens are now the source of truth?
4. What responsive behavior matters?
5. What remains intentionally undecided?
