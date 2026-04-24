# Development Guide

## Tooling

- Node.js 24+
- npm 11+
- Rust stable for Tauri desktop runs
- Tauri platform prerequisites for your OS
- Windows contributors should install the Visual Studio C++ desktop workload and Windows SDK before expecting `cargo check` or `tauri build` to link successfully

## Workspace commands

From the repo root:

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
npm run tauri:dev
```

Native Rust formatting can be checked independently from the Tauri host:

```bash
cd apps/desktop/src-tauri
cargo fmt --check
```

## Current package boundaries

- `apps/desktop`: React shell and Tauri desktop host
- `packages/shared-types`: shared domain contracts and capability flags

## Coding expectations

- keep shared contracts engine-neutral where possible
- isolate datastore-specific logic inside adapters or family-specific modules
- prefer capability checks over engine-specific UI branching
- keep privileged native operations behind Tauri commands
- redact sensitive data in logs and UI fixtures

## Adding a new datastore adapter

1. Add or extend the shared capability and connection contracts if needed.
2. Create the adapter under the relevant family directory in `src-tauri`.
3. Define validation, metadata, execution, and normalization behavior.
4. Add UI affordances only for capabilities the adapter declares.
5. Cover the new flow with unit and integration tests before exposing it broadly.
