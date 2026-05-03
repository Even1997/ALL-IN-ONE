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
2. Identify the core flow and acceptance criteria.
3. Call out conflicts, assumptions, and missing decisions explicitly.

Output rules:
- Be concrete and product-facing.
- Prefer structure over brainstorming.
- Keep implementation details secondary unless the user asks for them.
