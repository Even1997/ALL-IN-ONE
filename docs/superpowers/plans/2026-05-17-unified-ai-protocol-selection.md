# Unified AI Protocol Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify AI provider settings around an explicit protocol dropdown and remove misleading ClaudeRuntime/CodexRuntime app-config routing.

**Architecture:** Keep one built-in runtime configuration model, add an explicit protocol field, and let runtime protocol adapters route by that field instead of hidden baseURL heuristics. Preserve local Claude/Codex CLI as a separate local-agent flow, and remove the thin ClaudeRuntime/CodexRuntime app-config layer.

**Tech Stack:** React, Zustand, TypeScript, Node runtime sidecar, Tauri, Node test runner

---
