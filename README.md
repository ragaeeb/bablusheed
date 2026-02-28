# Bablusheed

[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/fea03dd4-8001-418f-a1fb-0ff821202310.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/fea03dd4-8001-418f-a1fb-0ff821202310)
[![codecov](https://codecov.io/gh/ragaeeb/bablusheed/graph/badge.svg?token=7O4ECN1EZ8)](https://codecov.io/gh/ragaeeb/bablusheed)
[![CI](https://github.com/ragaeeb/bablusheed/actions/workflows/ci.yml/badge.svg)](https://github.com/ragaeeb/bablusheed/actions/workflows/ci.yml)
[![Commitlint](https://github.com/ragaeeb/bablusheed/actions/workflows/commitlint.yml/badge.svg)](https://github.com/ragaeeb/bablusheed/actions/workflows/commitlint.yml)
[![Release](https://github.com/ragaeeb/bablusheed/actions/workflows/release.yml/badge.svg)](https://github.com/ragaeeb/bablusheed/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/ragaeeb/bablusheed)](https://github.com/ragaeeb/bablusheed/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196.svg)](https://www.conventionalcommits.org/en/v1.0.0/)
[![Built With Tauri](https://img.shields.io/badge/Built%20with-Tauri-24C8DB.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.3-000000.svg)](https://bun.sh/)
[![Platforms](https://img.shields.io/badge/Platforms-macOS%20%7C%20Windows%20%7C%20Linux-blue)](https://github.com/ragaeeb/bablusheed/releases)

Bablusheed is a Tauri + React desktop app that packs repositories into LLM-friendly bundles with token-aware optimization, balancing, and export workflows.

## What It Does

- Lets you open a project and select files quickly (`Source`, `Tests`, `Config`, `Docs`, custom filters).
- Estimates tokens per file and in total for the selected LLM profile.
- Packs selected files into `N` output packs (`Plain` or `Markdown`).
- Exports individual packs, or exports all packs in one folder operation.
- Adds optional prompt scaffolding for easier upload to ChatGPT/Claude/Gemini/etc.

## Optimization Features

- `Strip Comments`
- `Reduce Whitespace`
- `Minify Markdown` (plus heading/blockquote toggles)
- AST dead-code reduction (best effort) for `ts`, `tsx`, `js`, `jsx`, `py`, `rs`, `go`
- Advisory max tokens per packed file with:
  - non-blocking warnings,
  - auto-splitting oversized files into `part N/M`,
  - per-pack advisory status (ok/warn/danger)
- Docs-first ordering and dependency-aware grouping to reduce model search effort.

## Debugging & Diagnostics

Enable debug mode in the top bar to capture runtime logs and live counters:

- render counters (`renders/min`) for key components
- AST counters (`ast recompute`, `cache-hit`)
- worker pipeline counters (`queued`, `result`)
- export logs to `.log` / `.txt`

This is useful for token drift, performance regressions, and pack/render loop debugging.

## Icon Source of Truth

Desktop icon sources are:

- `src-tauri/icons/icon.png`
- `src-tauri/icons/icon.icns`
- `public/vite.svg` (web svg source; mirrored to `public/favicon.svg`)

Regenerate and clean icon outputs (desktop-only) with:

```bash
bun run sync:icons
```

This keeps only the icon files needed by desktop bundles and removes iOS/Android/Store extras.

## Development

### Prerequisites

- [Bun](https://bun.sh/)
- Rust toolchain
- Tauri OS prerequisites

### Run locally

```bash
bun dev
```

### Validate locally

```bash
bun run ci
```

## Testing

- Unit tests use `bun:test`
- Tests are colocated next to implementations (e.g. `src/lib/*.test.ts`)
- Recent regression coverage includes AST dead-code stripping and pack token mapping

## Release & Versioning

This repo uses Conventional Commits + semantic-release:

- Commit messages in merged PRs determine version bump (`feat` -> minor, `fix` -> patch, `!`/`BREAKING CHANGE` -> major)
- PR titles are also validated to follow Conventional Commits (helps squash-merge flows)
- On `main` pushes, release automation updates:
  - `package.json` version
  - `src-tauri/Cargo.toml` version
  - `src-tauri/tauri.conf.json` version
  - `CHANGELOG.md`
- It then tags/releases and builds desktop binaries via GitHub Actions

You should not need a separate "version bump PR".

## Tech Stack

- Tauri v2 (Rust backend)
- React 19 + Vite
- Tailwind CSS
- Base UI primitives
- Bun (dev/test/task runner)
