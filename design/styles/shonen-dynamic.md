---
id: shonen-dynamic
name: Shonen Dynamic
version: 1
sourceType: builtin
sourceDescription: "Built-in dark ACG action theme with orange-blue contrast and subtle glass layers"
theme: dark
density: compact
contrast: high
tags:
  - acg
  - shonen
  - bold
  - glassmorphism
  - action
confidence: 1
colors:
  background: '#131315'
  on-background: '#e5e1e4'
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1b1b1d'
  surface-container: '#201f21'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  surface-variant: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#e2bfb0'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#303032'
  outline: '#a98a7d'
  outline-variant: '#5a4136'
  surface-tint: '#ffb693'
  primary: '#ffb693'
  on-primary: '#561f00'
  primary-container: '#ff6b00'
  on-primary-container: '#572000'
  inverse-primary: '#a04100'
  secondary: '#79d8ff'
  on-secondary: '#003545'
  secondary-container: '#00bff1'
  on-secondary-container: '#004a5f'
  tertiary: '#ffb3b5'
  on-tertiary: '#680019'
  tertiary-container: '#ff6574'
  on-tertiary-container: '#690019'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
typography:
  display-lg:
    fontFamily: "Spline Sans"
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "Spline Sans"
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: "Spline Sans"
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: "Be Vietnam Pro"
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: "Be Vietnam Pro"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: "Be Vietnam Pro"
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: "Be Vietnam Pro"
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
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
effects:
  border-width: 1px
  focus-ring-width: 2px
  shadow-color: '#ff6b00'
  shadow-opacity: 0.15
  shadow-blur: 20px
  glass-blur: 20px
  glass-opacity: 0.7
motion:
  duration-fast: 150ms
  duration-normal: 220ms
  duration-slow: 320ms
  easing-standard: ease-out
  easing-emphasized: cubic-bezier(0.2, 0, 0, 1)
  press-scale: 1.05
components:
  button:
    shape: pill
    primaryStyle: solid
    secondaryStyle: ghost-outline
  card:
    imageScrim: true
    borderVisible: true
  chip:
    style: tinted
  input:
    style: filled
    focusStyle: outline-expand
  nav:
    style: glass
---

## Brand & Style

Shonen Dynamic is built for loud, fast-moving anime and community surfaces. It should feel like a premiere-night dashboard: charged, dramatic, and unmistakably social.

## Colors

Action orange drives primary motion and urgency. Mana blue supports status, secondary controls, and information accents so the palette feels heroic rather than monochrome.

## Typography

Spline Sans headlines should feel thick and poster-like. Be Vietnam Pro keeps long reading flows legible when the interface gets visually busy.

## Layout & Spacing

The pack expects a compact mobile-first rhythm on a 4px grid. Sections should stack tightly enough to feel energetic, but still preserve 16px and 24px rhythm between distinct content groups.

## Elevation & Depth

Depth comes from tonal stacking first and glow second. Glass surfaces should stay restrained so the orange charging effect remains the loudest visual signal.

## Shapes

Primary actions and chips should lean rounded and touch-friendly, while cards keep a firmer rectangle with softened corners. Focused cards can use thicker outlines to echo manga ink lines.

## Motion

Micro-interactions should feel snappy and slightly aggressive. Pressed cards and buttons can scale up subtly, but transitions should still stay under control and never feel floaty.

## Components

Primary buttons use solid orange with strong contrast. Cards should favor key art, bottom scrims, and compact metadata. Inputs stay dark-filled and reveal stronger focus emphasis on activation.

## Accessibility

Orange glow must not be the only focus cue. Maintain readable text contrast on all dark surfaces and keep icon-only controls labeled.

## Do / Don't

Do keep the hierarchy punchy, compact, and image-forward. Do not wash the UI out with too many semi-transparent layers or pastel accents.
