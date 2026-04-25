---
id: editorial-signal
name: Editorial Signal
version: 1
sourceType: builtin
sourceDescription: "Built-in content-first light theme with restrained accent color, readable typography, and editorial spacing"
theme: light
density: balanced
contrast: medium
tags:
  - editorial
  - content
  - minimal
  - reading
  - clean
confidence: 1
colors:
  background: '#f7f5f2'
  on-background: '#1d1a17'
  surface: '#fffdf9'
  surface-dim: '#e3dfda'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fbf8f4'
  surface-container: '#f6f1eb'
  surface-container-high: '#efe9e2'
  surface-container-highest: '#e8e1d9'
  surface-variant: '#e7e0d7'
  on-surface: '#1f1b17'
  on-surface-variant: '#61584f'
  inverse-surface: '#2c2722'
  inverse-on-surface: '#f6f0e9'
  outline: '#978b7d'
  outline-variant: '#d8cec3'
  surface-tint: '#8c4b2f'
  primary: '#8c4b2f'
  on-primary: '#ffffff'
  primary-container: '#ffdccc'
  on-primary-container: '#351000'
  inverse-primary: '#ffb699'
  secondary: '#4f6469'
  on-secondary: '#ffffff'
  secondary-container: '#d2e8ee'
  on-secondary-container: '#0a1f24'
  tertiary: '#6d5b8c'
  on-tertiary: '#ffffff'
  tertiary-container: '#eadbff'
  on-tertiary-container: '#25133f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
typography:
  display-lg:
    fontFamily: "Fraunces"
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "Fraunces"
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: "Fraunces"
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: "Source Sans 3"
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 30px
  body-md:
    fontFamily: "Source Sans 3"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-sm:
    fontFamily: "Source Sans 3"
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: "Source Sans 3"
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 56px
effects:
  border-width: 1px
  focus-ring-width: 2px
  shadow-color: '#8c4b2f'
  shadow-opacity: 0.08
  shadow-blur: 16px
  glass-blur: 0px
  glass-opacity: 1
motion:
  duration-fast: 140ms
  duration-normal: 210ms
  duration-slow: 300ms
  easing-standard: ease-out
  easing-emphasized: cubic-bezier(0.2, 0, 0, 1)
  press-scale: 1.01
components:
  button:
    shape: rounded-rect
    primaryStyle: solid
    secondaryStyle: text-outline
  card:
    imageScrim: false
    borderVisible: true
  chip:
    style: subtle-fill
  input:
    style: quiet-outline
    focusStyle: ring
  nav:
    style: minimal
---

## Brand & Style

Editorial Signal is a content-first pack for products where reading, reflection, and structured scanning matter more than spectacle. It should feel trustworthy, intelligent, and carefully composed.

## Colors

The palette stays warm-neutral with one earthy primary accent. Secondary and tertiary colors exist mainly to separate states and highlights without diluting the reading environment.

## Typography

Fraunces gives headlines an authored, editorial tone. Source Sans 3 keeps paragraphs, metadata, and controls clear across dense reading layouts.

## Layout & Spacing

Whitespace is part of the hierarchy in this pack. Use consistent gutters, generous paragraph measure, and distinct spacing tiers between sections, cards, and inline controls.

## Elevation & Depth

Depth should be quiet. Border definition and tonal contrast matter more than shadow drama, and surfaces should feel paper-like rather than glassy.

## Shapes

Rounded corners stay modest and largely structural. This pack should never feel toy-like or overly soft.

## Motion

Motion should stay understated and almost invisible. The role of animation here is to preserve continuity, not personality.

## Components

Buttons and chips should be neat and typographic. Cards can be content containers first, and inputs should be clear without calling attention to themselves.

## Accessibility

Reading interfaces need careful line height, line length, and contrast discipline. Large content blocks should remain comfortable at increased text sizes.

## Do / Don't

Do prioritize readability, spacing, and tonal restraint. Do not add neon accents, excessive blur, or dense badge-heavy layouts that compete with the content.
