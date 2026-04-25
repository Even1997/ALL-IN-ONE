---
id: soft-clay-play
name: Soft Clay Play
version: 1
sourceType: builtin
sourceDescription: "Built-in playful claymorphism-inspired light theme with soft shadows and oversized rounded forms"
theme: light
density: spacious
contrast: medium
tags:
  - playful
  - claymorphism
  - soft
  - friendly
  - consumer
confidence: 1
colors:
  background: '#f6efe8'
  on-background: '#2f2823'
  surface: '#fffaf5'
  surface-dim: '#e6ddd4'
  surface-bright: '#ffffff'
  surface-container-lowest: '#fffdfb'
  surface-container-low: '#fbf3ec'
  surface-container: '#f7eee6'
  surface-container-high: '#efe4db'
  surface-container-highest: '#e8dbd1'
  surface-variant: '#e7ddd5'
  on-surface: '#2b2622'
  on-surface-variant: '#6d6258'
  inverse-surface: '#34302c'
  inverse-on-surface: '#f7f0e9'
  outline: '#b5a79b'
  outline-variant: '#ddd0c4'
  surface-tint: '#ff8f6b'
  primary: '#f47f57'
  on-primary: '#ffffff'
  primary-container: '#ffd7ca'
  on-primary-container: '#55210f'
  inverse-primary: '#b94c29'
  secondary: '#6caec1'
  on-secondary: '#ffffff'
  secondary-container: '#d1f0f8'
  on-secondary-container: '#173d47'
  tertiary: '#c79b3b'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffe8ab'
  on-tertiary-container: '#4b3900'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
typography:
  display-lg:
    fontFamily: "Baloo 2"
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: "Baloo 2"
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: "Baloo 2"
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: "Nunito"
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
  body-md:
    fontFamily: "Nunito"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: "Nunito"
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: "Nunito"
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.75rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 2.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin-mobile: 20px
  margin-desktop: 48px
effects:
  border-width: 1px
  focus-ring-width: 2px
  shadow-color: '#c79b3b'
  shadow-opacity: 0.14
  shadow-blur: 26px
  glass-blur: 0px
  glass-opacity: 1
motion:
  duration-fast: 170ms
  duration-normal: 250ms
  duration-slow: 360ms
  easing-standard: ease-out
  easing-emphasized: cubic-bezier(0.22, 1, 0.36, 1)
  press-scale: 0.98
components:
  button:
    shape: pill
    primaryStyle: soft-solid
    secondaryStyle: raised-tint
  card:
    imageScrim: false
    borderVisible: false
  chip:
    style: soft-fill
  input:
    style: soft-inset
    focusStyle: warm-ring
  nav:
    style: floating-pill
---

## Brand & Style

Soft Clay Play is a friendly consumer theme built around tactile softness. It should feel approachable, cushioned, and cheerful without becoming childish.

## Colors

Warm peach leads the brand tone, while teal and honey gold provide balance and utility. The palette stays pastel enough to feel soft, but still maintains enough contrast to remain usable.

## Typography

Rounded display type keeps the top of the hierarchy playful. Nunito carries the body text so longer content still feels calm and readable.

## Layout & Spacing

This pack expects more whitespace and larger insets than compact productivity themes. Content groups should feel comfortably separated rather than tightly packed.

## Elevation & Depth

Depth comes from soft diffuse shadows and gentle tonal lift. Avoid glass treatment here; the interface should feel molded and material rather than frosted.

## Shapes

Large radii are central to the identity. Cards, buttons, inputs, and floating navigation should all feel almost sculpted by hand.

## Motion

Motion should compress slightly on press and rebound softly. The feedback language should feel tactile and safe, not sharp or electric.

## Components

Buttons should look touchable and plush. Cards can rely on tonal fill and shadow separation, while inputs should feel inset into the page rather than outlined aggressively.

## Accessibility

Pastel palettes can fail contrast quickly, so labels and body text need explicit checking. Soft shadows are not enough to indicate focus or state change.

## Do / Don't

Do keep the UI warm, tactile, and breathing. Do not pair this pack with harsh outlines, rigid grids, or dark industrial surfaces.
