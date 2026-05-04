---
name: Requirements
description: Clarify goals, flows, constraints, acceptance criteria, and open questions for a product request.
when_to_use: Use when the user is defining, refining, or reviewing requirements.
package: requirements
skill: requirements
token: @requirements
aliases: @requirements, @requirement, @需求
arguments: request
argument-hint: <request>
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
disable-model-invocation: false
---

Goal: convert raw product intent into a confirmable requirements artifact.

Current request focus:
$request

Workflow:
1. Extract the user goal, target user, scope, and constraints.
2. Identify the target surface before sketching or UI work: mobile app, mobile web, tablet, desktop web, desktop app, or responsive multi-surface.
3. Record the intended canvas or breakpoint assumptions, such as 390x844 mobile, 768x1024 tablet, 1440x900 desktop, or the project's explicit target size.
4. Identify the core flow and acceptance criteria.
5. Call out conflicts, assumptions, and missing decisions explicitly.

Output rules:
- Be concrete and product-facing.
- Include a "Target surface" section with platform, orientation when relevant, and canvas or breakpoint assumptions.
- If the target surface is missing, ask for it or mark it as an open decision instead of silently assuming desktop or mobile.
- Prefer structure over brainstorming.
- Keep implementation details secondary unless the user asks for them.
