# Code Quality And Architecture Investigation

Date: 2026-04-25

This report captures the current architecture risks found while hardening the datastore adapter work. It is intentionally practical: each finding should point to a refactor, a guardrail, or a test that reduces the chance of the codebase becoming harder to evolve.

## Executive Summary

Datanaut is moving quickly from a small Tauri workbench into a broad datastore product. The main architectural risk is concentration: large files now carry too many responsibilities, especially the Rust adapter module and the React workbench shell. This makes new engines easy to add in the short term, but expensive to validate and risky to refactor later.

The most urgent backend issue was a duplicate TimescaleDB implementation: an inherent `impl TimescaleAdapter` coexisted with the trait implementation, which allowed manifest calls and runtime adapter behavior to disagree. That has been removed, and the contract tests now check beta preview-only behavior for risky operations.

## Current Hotspots

Largest source files at investigation time:

| File | Approx. lines | Primary risk |
| --- | ---: | --- |
| `apps/desktop/src-tauri/src/adapters/mod.rs` | 5,977 after first split | Adapter registry, shared helpers, protocol code, pagination, structure maps, beta adapters, and multiple engine implementations still live together. |
| `apps/desktop/src/services/runtime/client.ts` | 1,757 | Runtime IPC client, request mapping, and result shape concerns appear concentrated. |
| `packages/shared-types/src/datastore-roadmap.ts` | 1,694 | Product catalog is valuable but large; future edits need contract tests and generated/structured sections. |
| `apps/desktop/src/app/components/workbench/SideBar.tsx` | 1,652 | Connection list, tree rendering, grouping, context menus, and explorer behavior are in one UI component. |
| `apps/desktop/src-tauri/src/app/runtime.rs` | 1,524 | Runtime orchestration and command behavior are concentrated. |
| `apps/desktop/src/app/App.tsx` | 1,421 | App shell state transitions, activity routing, explorer loading, tabs, drawers, and command handling are coupled. |
| `apps/desktop/src/app/state/app-state.tsx` | 1,233 | State model and reducer/helper logic need smaller domains. |
| `apps/desktop/src/app/components/workbench/RightDrawer.tsx` | 1,020 | Diagnostics/details rendering has likely grown beyond one component. |

## Completed In This Pass

### Durable Roadmap

Added `docs/architecture/datastore-adapter-roadmap.md` with:

- Adapter completion bar.
- Datastore families.
- Query languages.
- Capabilities.
- Operation, permission, diagnostics, and guardrail models.
- Four-wave implementation plan.
- Per-datastore backlog.
- Target adapter module layout.
- Test plan.

### Backend Refactor

Split several datastore implementations out of `apps/desktop/src-tauri/src/adapters/mod.rs`:

- `apps/desktop/src-tauri/src/adapters/common/`
- `apps/desktop/src-tauri/src/adapters/contract.rs`
- `apps/desktop/src-tauri/src/adapters/registry.rs`
- `apps/desktop/src-tauri/src/adapters/runtime.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/bigquery/`
- `apps/desktop/src-tauri/src/adapters/datastores/cassandra/`
- `apps/desktop/src-tauri/src/adapters/datastores/clickhouse/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/cosmosdb/`
- `apps/desktop/src-tauri/src/adapters/datastores/duckdb/`
- `apps/desktop/src-tauri/src/adapters/datastores/dynamodb/`
- `apps/desktop/src-tauri/src/adapters/datastores/influxdb/`
- `apps/desktop/src-tauri/src/adapters/datastores/janusgraph/`
- `apps/desktop/src-tauri/src/adapters/datastores/litedb/`
- `apps/desktop/src-tauri/src/adapters/datastores/memcached/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/mongodb/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/mysql/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/neo4j/`
- `apps/desktop/src-tauri/src/adapters/datastores/neptune/`
- `apps/desktop/src-tauri/src/adapters/datastores/opentsdb/`
- `apps/desktop/src-tauri/src/adapters/datastores/oracle/`
- `apps/desktop/src-tauri/src/adapters/datastores/postgresql/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/prometheus/`
- `apps/desktop/src-tauri/src/adapters/datastores/redis/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/search/`
- `apps/desktop/src-tauri/src/adapters/datastores/snowflake/`
- `apps/desktop/src-tauri/src/adapters/datastores/sqlite/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/sqlserver/mod.rs`
- `apps/desktop/src-tauri/src/adapters/datastores/valkey/mod.rs`

`mod.rs` remains the public facade and registry for now. This keeps all existing app-facing adapter functions stable while moving datastore-specific protocol helpers, paging, and adapter implementations into datastore-owned folders.

### Backend Hardening

Removed duplicate TimescaleDB implementation and made the trait implementation the single source of truth.

Added adapter contract tests for:

- Concrete preview adapters exposing manifests, operations, permissions, diagnostics, and live metadata capability.
- Beta adapters keeping risky write/destructive operations preview-only.
- Memcached write commands failing before network access.
- Empty ClickHouse queries failing before network access.
- ClickHouse and Memcached returning safe non-cursor pagination responses.
- Snowflake returning SQL API request-builder, profile, metrics, and cost-estimate payloads without live credentials.
- Cassandra returning CQL request-builder, partition-key guardrail, profile, metrics, and safe mutation-blocking payloads.
- LiteDB returning .NET sidecar bridge request-builder, document/table/profile/metrics payloads, and safe mutation-blocking behavior.
- Oracle returning SQL/PLSQL driver request-builder, DBMS_XPLAN/profile/metrics payloads, client/runtime prerequisite warnings, and safe mutation-blocking behavior.

## Findings

### Finding 1: Adapter Module Still Has Too Many Responsibilities

`apps/desktop/src-tauri/src/adapters/mod.rs` has improved, but still mixes:

- Public facade functions.
- Trait definition.
- Registry.
- Manifest and capability constants.
- Result payload builders.
- Operation planning.
- Permission inspection.
- Diagnostics defaults.
- SQL value stringification.
- Protocol connection helpers.
- Pagination helpers.
- Structure map builders.
- Concrete engine adapters.
- Beta adapter request-builder behavior.

Completed grouping:

- ClickHouse is grouped with its HTTP helper and result parsing.
- Memcached is grouped with its text protocol helper and stats normalization.
- MongoDB is grouped with its client construction, paging, structure map, and adapter implementation.
- MySQL and MariaDB are grouped with their DSN, paging, structure, and shared adapter implementation.
- PostgreSQL, CockroachDB, and TimescaleDB are grouped together around the PostgreSQL wire path and Cockroach/Timescale-specific metadata surfaces.
- Redis and Valkey are grouped in datastore modules, with Valkey explicitly delegating to Redis protocol behavior.
- SQLite is grouped with its file DSN, paging, structure map, and local database manifest behavior.
- SQL Server is grouped with its TDS client setup, structure map, and adapter implementation.

Recommended next split:

1. Continue splitting large datastore folders into `catalog`, `connection`, `explorer`, `query`, and `diagnostics` where any single file grows too large.
2. Split `datastores/postgresql/mod.rs` further into PostgreSQL, CockroachDB, and TimescaleDB submodules while keeping shared PostgreSQL-wire helpers local.
3. Keep the generic planned adapter only for engines not yet concrete.
4. Add drift tests so `registry.rs`, shared TypeScript roadmap data, and UI engine selectors cannot silently disagree.

### Finding 2: Registry And Catalog Should Be Hard To Desynchronize

Adapter manifests exist in Rust runtime code and related roadmap/catalog data exists in TypeScript shared packages. These can drift.

Recommended tests:

- Cross-runtime catalog snapshot test comparing Rust adapter manifest ids/engines with the shared TypeScript catalog.
- Contract test that each manifest capability has at least one operation, diagnostic, explorer node, or renderer using it.
- Test that every beta adapter marks write/destructive operations as preview-only.

### Finding 3: Preview Adapters Need Network-Free Safety Tests

Preview adapters are often easiest to break by accidentally moving validation after network access. The new tests protect two important examples:

- Memcached rejects writes before opening a socket.
- ClickHouse rejects empty SQL before opening a socket.

Recommended expansion:

- Redis/Valkey unsupported mutations in read-only profiles.
- Cloud adapters reject missing identity before request signing.
- Search adapters validate malformed Query DSL before HTTP execution.

### Finding 4: UI Workbench Components Are Too Broad

`SideBar.tsx`, `App.tsx`, `RightDrawer.tsx`, and `app-state.tsx` are each carrying multiple responsibilities. This makes UI regressions more likely as datastore surfaces expand.

Recommended extraction:

- `SideBar.tsx`
  - `ConnectionsPane`
  - `ConnectionTree`
  - `ConnectionContextMenu`
  - `ConnectionGroupingControl`
  - `ExplorerSidebar`
- `App.tsx`
  - `useWorkbenchActivity`
  - `useExplorerLoader`
  - `useTabLifecycle`
  - `useConnectionSelection`
- `RightDrawer.tsx`
  - `DiagnosticsPanel`
  - `PermissionPanel`
  - `OperationPreviewPanel`
- `app-state.tsx`
  - separate reducers for connections, tabs, execution, explorer, UI layout, and theme.

### Finding 5: Tests Are Growing But Need More Architectural Coverage

The current Rust adapter integration tests cover key contracts and fixture roundtrips. Frontend Vitest coverage exists for major app flows. The next test layer should prevent architecture drift.

Recommended tests:

- Rust module-level tests for `common` once extracted.
- Fixture tests for ClickHouse, Valkey, Memcached, TimescaleDB, and CockroachDB when containers are added.
- UI tests for per-engine explorer entry, disabled reasons, diagnostics, and operation previews.
- Shared-types tests that verify every datastore roadmap entry has family, language, capability, renderer, baseline story, diagnostic story, and analytics signal.

## Refactor Rules Going Forward

- Do not add new engines directly to `adapters/mod.rs`.
- New engines should live in family modules.
- Public adapter facade functions should remain stable.
- Every new engine must include manifest, operations, permissions, diagnostics, explorer, execution or request-builder behavior, and tests.
- Risky operations must be preview-only unless a specific execution pass enables them.
- Any bug discovered during extraction should get a regression test before or alongside the fix.

## Immediate Next Steps

1. Extract PostgreSQL/CockroachDB/TimescaleDB into smaller submodules inside their datastore folder.
2. Replace contract-only Oracle and LiteDB execution with real driver/sidecar dispatch behind the existing adapter folders.
3. Add ClickHouse, Valkey, Memcached, Cassandra-compatible, and TimescaleDB fixture services to `tests/fixtures/docker-compose.yml`.
4. Split `SideBar.tsx` around connection tree and context menu boundaries.
5. Split `App.tsx` activity/tab/explorer logic into hooks.
6. Add catalog drift tests between Rust manifests and shared TypeScript roadmap.
