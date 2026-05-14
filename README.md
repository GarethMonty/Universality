# Datanaut

[![CI](https://github.com/GarethMonty/Datanaut/actions/workflows/ci.yml/badge.svg)](https://github.com/GarethMonty/Datanaut/actions/workflows/ci.yml)

Datanaut is a cross-platform desktop workbench for exploring, querying, inspecting, and managing multiple datastore families from one consistent interface.

The project is built as a Tauri desktop application with a React and TypeScript workbench, a Rust native host, and shared datastore contracts. It is intentionally desktop-first: the web frontend exists to render the Tauri shell, not to ship a hosted web app.

## Project Status

Datanaut is early-stage software. The repository contains the desktop foundation, shared domain contracts, adapter catalog, native command surface, fixture-backed integration tests, and the first capability-driven datastore adapter work.

Public docs use two labels:

- **Current app foundation**: workflows that exist in the repository today, including the desktop workbench, local workspace state, environments, query tabs, adapter manifests, diagnostics, fixtures, and Tauri command wiring.
- **Adapter roadmap**: datastore support that is represented in contracts, manifests, beta adapters, tests, or roadmap documents. Some adapters are read/diagnostic-oriented or preview-only while the product hardens live execution paths.

## What Datanaut Does

Datanaut is designed for developers and operators who move between different data systems and want one local, safety-aware workstation instead of a stack of disconnected tools.

Current workbench capabilities include:

- connection profiles with engine, family, environment, read-only, tags, notes, and secret reference metadata
- environment profiles with variables, inheritance, risk levels, safe mode, sensitive-key redaction, and confirmation settings
- query tabs with datastore-aware editor language selection, saved queries, closed-tab recovery, result history, and dirty-state handling
- capability-driven adapter manifests so the UI can react to features instead of hardcoding engine branches
- explorer and structure views for datastore metadata
- normalized result payloads for tables, JSON, documents, key-value data, schemas, graphs, charts, plans, metrics, series, search hits, profiles, and cost estimates
- guardrail decisions for read-only connections, risky environments, destructive-looking queries, and unresolved variables
- workspace lock, diagnostics, encrypted workspace bundle import/export, and local/browser-preview fallback behavior
- Docker fixture flows and Tauri/WebDriver e2e plumbing for adapter and desktop validation

## Datastore Coverage

The adapter model separates UI capability from engine-specific implementation. Maturity values come from the shared adapter catalog and runtime manifests.

| Maturity | Datastores | Meaning |
| --- | --- | --- |
| MVP target / active foundation | PostgreSQL, CockroachDB, SQL Server / Azure SQL, MySQL, MariaDB, SQLite, MongoDB, Redis | Core workbench paths are being built and tested first. Local fixture coverage exists for the primary SQL/document/cache set where practical. |
| Beta / contract-oriented | Oracle, TimescaleDB, DynamoDB, Cassandra, Cosmos DB, LiteDB, Valkey, Memcached, Neo4j, Amazon Neptune, ArangoDB, JanusGraph, InfluxDB, Prometheus, OpenTSDB, Elasticsearch, OpenSearch, ClickHouse, DuckDB, Snowflake, BigQuery | Adapters and catalog entries expose capability, operation, permission, diagnostics, and preview behavior while live execution and cloud identity paths are hardened. |
| Roadmap families | SQL, document, key-value, graph, time-series, wide-column, search, warehouse, embedded OLAP | The product direction is broader than the initial MVP, but public docs distinguish roadmap from finished support. |

For the deeper implementation plan, see [Datastore Adapter Roadmap](docs/architecture/datastore-adapter-roadmap.md).

## Quick Start

### Prerequisites

- Node.js 24+
- npm 11+
- Rust stable toolchain
- Tauri platform prerequisites from the [official Tauri docs](https://tauri.app/start/prerequisites/)
- Docker, when running database fixtures
- On Windows, the Visual Studio C++ desktop workload and Windows SDK required by Tauri native builds

### Install

```bash
npm install
```

### Run the desktop app

```bash
npm run tauri:dev
```

### Run the fast frontend preview

This runs the Tauri frontend layer in Vite at `http://127.0.0.1:1420`. It is useful for UI work, but it is not the full native desktop runtime.

```bash
npm run dev
```

### Build

```bash
npm run build
npm run tauri:build
```

### Validate

```bash
npm run check
npm run check:native
npm run check:all
npm run ci:test
```

Useful individual checks:

```bash
npm run lint
npm run test
npm run rust:fmt
npm run rust:check
npm run rust:test
npm run rust:clippy
```

## Fixtures And E2E

Database fixtures live under `tests/fixtures` and are driven by Docker Compose plus seed scripts.

```bash
npm run fixtures:up
npm run fixtures:seed
npm run fixtures:down
```

Additional fixture helpers:

```bash
npm run fixtures:up:profile
npm run fixtures:up:all
npm run fixtures:seed:all
```

Desktop end-to-end support uses Tauri driver and WebDriverIO.

```bash
npm run e2e:desktop
npm run check:e2e
```

## Repository Layout

```text
Datanaut/
  apps/
    desktop/           React workbench, Vite app, and Tauri host
  packages/
    shared-types/      Shared contracts, capabilities, runtime models, and datastore catalog
  docs/
    architecture/      Architecture, adapter model, safety, roadmap, and investigation notes
    contributing/      Development workflow and coding expectations
    testing/           Test strategy
  tests/
    fixtures/          Docker Compose fixtures and seed data
```

## Architecture

Datanaut is organized around a capability-driven desktop architecture:

1. The React UI shell owns layout, navigation, workbench panes, query editors, result surfaces, and user interaction.
2. The application layer coordinates workspace state, active connection/environment selection, guardrails, query execution, saved work, and diagnostics.
3. Shared TypeScript contracts define datastore families, engines, capabilities, connections, environments, runtime requests, results, and workspace state.
4. Rust adapters isolate engine-specific connection validation, metadata exploration, execution, result normalization, operation planning, permissions, and diagnostics.
5. The Tauri native layer owns privileged desktop commands, persistence, secret storage integration, local file selection, imports/exports, and OS integration.

Key docs:

- [Architecture Overview](docs/architecture/overview.md)
- [Adapter Model](docs/architecture/adapter-model.md)
- [Security And Safety](docs/architecture/security-and-safety.md)
- [Datastore Adapter Roadmap](docs/architecture/datastore-adapter-roadmap.md)
- [Development Guide](docs/contributing/development.md)
- [Testing Strategy](docs/testing/strategy.md)

The public wiki is intended to live at [github.com/GarethMonty/Datanaut/wiki](https://github.com/GarethMonty/Datanaut/wiki).

## Security And Safety

Datanaut is designed for workflows that may touch live credentials and production systems. The safety model is part of the architecture:

- keep secret values in the OS credential store where available and persist only references in regular workspace state
- redact sensitive values in previews, logs, diagnostics, and exports by default
- make environment risk visible through the workbench
- support read-only profiles and safe-mode behavior
- require confirmation for risky operations in high-risk environments
- block or warn on destructive-looking queries, unresolved variables, large result sets, costly operations, and preview-only adapter paths

Early-stage users should treat production connections with care, keep profiles read-only by default, and review generated operation plans before running anything against important systems.

## CI And Releases

CI runs on pull requests and pushes to `main`, `release/**`, and `app-v*` tags. It intentionally stays deterministic: frontend lint/tests/build, release workflow tests, quality tests, Rust formatting/check/test/clippy, and dependency-free adapter/runtime integration tests. Docker fixtures, desktop E2E, and live datastore/cloud checks remain local or manually triggered workflows for now.

Tagged releases use `.github/workflows/release.yml`. Pushing an `app-v*` tag or running the workflow manually builds draft Tauri desktop release artifacts for Linux, Windows, and macOS, with signing/notarization hooks available through repository secrets.

## Contributing

The project is public and contributions should follow the existing architecture:

- keep shared contracts engine-neutral when possible
- put datastore-specific logic behind adapters or family-specific modules
- prefer capability checks over engine-name checks in the UI
- keep privileged operations behind Tauri commands
- redact sensitive data in fixtures, tests, logs, diagnostics, screenshots, and docs
- add tests around new adapter behavior, guardrails, and public contracts

Start with the [Development Guide](docs/contributing/development.md), [Testing Strategy](docs/testing/strategy.md), and [Datastore Adapter Roadmap](docs/architecture/datastore-adapter-roadmap.md).

## License

No license file has been added yet. Until a license is published, all rights are reserved by the repository owner.
