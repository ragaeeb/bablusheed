# AGENTS.md

This file provides fast, practical context for AI/code agents working in this repository.

## Project Snapshot

Bablusheed is a desktop code-packing tool for LLM workflows.

Primary goal:

- turn a selected project subset into token-efficient pack files that are easier for LLMs to read and reason about.

Core constraints:

- preserve correctness of packed code,
- reduce token waste,
- keep UX responsive for large selections.

## Repo Layout

- `src/`
- `src/App.tsx`: top-level orchestration, debug panel/counters, theme, project lifecycle
- `src/components/`: UI components (`FileTree`, `PackOptions`, `OutputPreview`, etc.)
- `src/hooks/useFileTree.ts`: file tree and selection state
- `src/hooks/useTokenCount.ts`: token pipeline orchestration and worker queueing
- `src/hooks/usePackager.ts`: packing pipeline (optimizations + backend pack invoke)
- `src/lib/pack-strategy.ts`: advisory budgeting, oversized split balancing, warnings
- `src/lib/ast-reachability.ts`: AST dead-code integration + conservative strip logic
- `src/lib/render-diagnostics.ts`: render burst instrumentation for debug counters
- `src/workers/tokenizer.worker.ts`: worker-side token counting

- `src-tauri/src/`
- `commands/fs.rs`: directory walk/read/write commands
- `commands/pack.rs`: backend pack algorithm
- `commands/ast.rs`: reachability analysis with tree-sitter
- `lib.rs`: app bootstrap/plugins/menu wiring

- `.github/workflows/`
- `ci.yml`: lint/test/build/check pipeline
- `commitlint.yml`: conventional-commit enforcement on PR commits
- `release.yml`: semantic-release + multi-OS Tauri bundle publishing

- `scripts/`
- `sync-icons.ts`: regenerate/prune desktop icons only
- `sync-version.mjs`: sync version across package/tauri/cargo

## Conventions

- TypeScript strictness: keep types explicit at module boundaries.
- Tests: colocated (`*.test.ts`) beside implementation.
- Test style: `it('should ...')` convention.
- Keep utilities pure when possible (`src/lib/*`) and move business logic out of components/hooks.
- Keep commits Conventional Commit compatible.

## Token Optimization Strategy (Current)

- Optional passes: strip comments, reduce whitespace, markdown minification, AST dead-code (entry-point based).
- Advisory `max tokens per packed file` (auto-derived or user-specified).
- Detect oversized files and auto-split into parts to balance pack loads.
- Prefer docs-first ordering and dependency-adjacent grouping to reduce LLM context search cost.

## Known Pitfalls / Lessons Learned

- AST stripping can remove valid exports if heuristics are too aggressive.
- Always add regression tests before adjusting `stripUnreachableSymbols` behavior.
- For whitespace optimization, verify token deltas with AST on/off; interactions can be non-obvious.
- Avoid dependency arrays tied to unstable object identities in hooks; use stable identity keys.
- Save/export failures are usually Tauri command/capability mismatches; verify `write_file_content` flow first.

## Debugging Playbook

1. Repro with debug logging enabled in the UI.
2. Export logs from the debug panel.
3. Inspect live counters:
- renders/min (`App`, `FileTree`, `OutputPreview`)
- AST events (`ast recompute`, `cache-hit`)
- worker events (`queued`, `result`)
4. If token anomalies appear:
- compare `charDelta`, queued/result counts, and optimization toggles.
- isolate with AST off, then AST on with entry point.
5. If UI is sluggish:
- watch render counters for spikes,
- inspect effects depending on frequently recreated arrays/maps.

## TDD Expectations for Bug Fixes

- Write/extend failing test first.
- Keep regressions permanently in suite.
- Cover edge cases around export/public symbol preservation.
- Run targeted tests, then full suite.

Typical commands:

```bash
bun test src/lib/ast-reachability.test.ts
bun test
bun run ci
```

## Release/Versioning Notes

- semantic-release is configured via `.releaserc.cjs`.
- Version sync script updates:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- Do not hand-edit versions unless intentionally doing a one-off recovery.

## Icon Workflow

Sources of truth:

- `src-tauri/icons/icon.png`
- `src-tauri/icons/icon.icns`
- `public/favicon.svg`

Regenerate:

```bash
bun run sync:icons
```

This intentionally prunes non-desktop icon artifacts.
