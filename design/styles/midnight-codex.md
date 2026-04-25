---
id: midnight-codex
name: Midnight Codex
version: 1
sourceType: builtin
sourceDescription: "Built-in dark product theme for AI and tool interfaces with restrained glow and terminal-like focus"
theme: dark
density: compact
contrast: medium
tags:
  - ai
  - tool
  - minimal
  - dark
  - productivity
confidence: 1
colors:
  background: '#0f1115'
  on-background: '#edf1f7'
  surface: '#12161d'
  surface-dim: '#0b0e13'
  surface-bright: '#232a35'
  surface-container-lowest: '#090c10'
  surface-container-low: '#141922'
  surface-container: '#1a202a'
  surface-container-high: '#232a35'
  surface-container-highest: '#2b3340'
  surface-variant: '#27303b'
  on-surface: '#e4e9f1'
  on-surface-variant: '#98a4b5'
  inverse-surface: '#edf1f7'
  inverse-on-surface: '#1b212b'
  outline: '#475569'
  outline-variant: '#2b3542'
  surface-tint: '#79c0ff'
  primary: '#79c0ff'
  on-primary: '#032741'
  primary-container: '#0e3b63'
  on-primary-container: '#c8e6ff'
  inverse-primary: '#005b96'
  secondary: '#89f0c4'
  on-secondary: '#003826'
  secondary-container: '#0d5a42'
  on-secondary-container: '#b8ffe2'
  tertiary: '#d3b3ff'
  on-tertiary: '#35105d'
  tertiary-container: '#59328f'
  on-tertiary-container: '#f0ddff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
typography:
  display-lg:
    fontFamily: "Space Grotesk"
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "Space Grotesk"
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: "Space Grotesk"
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: "IBM Plex Sans"
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: "IBM Plex Sans"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: "IBM Plex Sans"
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: "IBM Plex Sans"
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.375rem
  DEFAULT: 0.75rem
  md: 1rem
  lg: 1.25rem
  xl: 1.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin-mobile: 16px
  margin-desktop: 32px
effects:
  border-width: 1px
  focus-ring-width: 2px
  shadow-color: '#79c0ff'
  shadow-opacity: 0.12
  shadow-blur: 18px
  glass-blur: 14px
  glass-opacity: 0.58
motion:
  duration-fast: 130ms
  duration-normal: 200ms
  duration-slow: 280ms
  easing-standard: ease-out
  easing-emphasized: cubic-bezier(0.16, 1, 0.3, 1)
  press-scale: 1.02
components:
  button:
    shape: rounded-rect
    primaryStyle: solid
    secondaryStyle: muted
  card:
    imageScrim: false
    borderVisible: true
  chip:
    style: subtle-outline
  input:
    style: low-contrast-filled
    focusStyle: ring
  nav:
    style: tonal
---

## Brand & Style

Midnight Codex is built for serious tool surfaces such as AI workspaces, editors, and operational dashboards. It should feel focused, technical, and quietly premium rather than flashy.

## Colors

The palette stays blue-forward with mint and violet accents to separate state and hierarchy without overwhelming the workspace. Surface values are close together so content, not decoration, carries the interface.

## Typography

Space Grotesk headlines give the UI a modern technical tone. IBM Plex Sans keeps dense operational text readable and reinforces the product-tool character.

## Layout & Spacing

This pack expects compact density and strong alignment. Margins are tighter than in entertainment styles, and whitespace should be used for grouping and scannability rather than exuberance.

## Elevation & Depth

Depth should remain restrained. Tonal layers do most of the work, with subtle blue edge glow reserved for focus, selection, and primary action.

## Shapes

Shapes are softened enough to feel contemporary, but still more rectilinear than playful. Inputs and panels should look deliberate and stable.

## Motion

Transitions should be quick, quiet, and interruptible. Feedback exists to confirm action, not to draw attention to itself.

## Components

Primary actions use clean filled buttons with high contrast. Cards and panels should favor muted borders, code-friendly spacing, and readable metadata blocks.

## Accessibility

Low-contrast surfaces must not reduce text readability. Focus rings should stay explicit, especially in keyboard-heavy tool flows.

## Do / Don't

Do keep the interface calm, dense, and work-oriented. Do not import toy-like glows, oversized radii, or heavy decorative gradients.
