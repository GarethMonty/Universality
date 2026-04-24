# Universality

Universality is a cross-platform desktop workstation for querying, browsing, inspecting, and managing multiple datastore families through one consistent Tauri-based interface.

This repository is intentionally desktop-only. The React layer exists to render the Tauri shell, not to ship a separate website or hosted web app.

The repo now contains the first desktop-oriented foundation for that product:

- a React + TypeScript desktop shell under `apps/desktop`
- a Tauri native scaffold under `apps/desktop/src-tauri`
- shared domain contracts under `packages/shared-types`
- architecture, security, testing, and contributor docs under `docs`

## MVP focus

The initial implementation is aligned to the blueprint MVP:

- PostgreSQL
- SQL Server
- MySQL / MariaDB
- SQLite
- MongoDB
- Redis

## Getting started

### Prerequisites

- Node.js 24+
- npm 11+
- Rust stable toolchain for Tauri desktop runs
- Tauri platform prerequisites from the [official docs](https://tauri.app/start/prerequisites/)
- On Windows, install the Visual Studio C++ desktop workload and Windows SDK required by Tauri before running native desktop builds

### Install

```bash
npm install
```

### Run the desktop UI shell

```bash
npm run tauri:dev
```

### Run the fast UI dev server

This is still the Tauri frontend layer, not a separate website.

```bash
npm run dev
```

### Validate the workspace

```bash
npm run check
```

For native formatting checks:

```bash
cd apps/desktop/src-tauri
cargo fmt --check
```

## Repo layout

```text
Universality/
  apps/
    desktop/           React desktop shell + Tauri host
  packages/
    shared-types/      Shared product contracts and capability types
  docs/
    architecture/      Layering, adapter model, security approach
    contributing/      Developer workflow and coding guidance
    testing/           Testing strategy and quality gates
```

## Key docs

- [Architecture Overview](docs/architecture/overview.md)
- [Adapter Model](docs/architecture/adapter-model.md)
- [Security And Safety](docs/architecture/security-and-safety.md)
- [Development Guide](docs/contributing/development.md)
- [Testing Strategy](docs/testing/strategy.md)

## Release automation

- `.github/workflows/ci.yml` runs frontend checks on every PR and native Tauri smoke builds on `main`, `release/**`, and `app-v*` tags
- `.github/workflows/release.yml` builds tagged desktop releases with Tauri packaging and signing/notarization secret hooks
