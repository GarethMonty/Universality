# DataPad++ Feature Guide

This guide describes the product surface that exists in the current repository after the DataPad++ rename. It separates live app behavior from roadmap intent so contributors know what is ready to use, what is guarded, and where to add new work.

## Naming

- Product name: **DataPad++**
- Repository-safe name: `DataPadPlusPlus`
- Package/crate-safe name: `datapadplusplus`
- NPM packages: `@datapadplusplus/desktop` and `@datapadplusplus/shared-types`
- Rust crate: `datapadplusplus-desktop`
- Default Tauri identifier: `com.datapadplusplus.desktop`
- Current environment variable prefix: `DATAPADPLUSPLUS_`

Legacy `DATANAUT_*` and `UNIVERSALITY_*` environment variables are still read as fallbacks for local workspaces, secret files, and fixtures. This is intentional compatibility, not the new public name.

## Workbench Shell

The desktop app is organized around a VS Code-style workbench:

- Activity bar for Connections, Library, Search, Environments, Settings, theme, and lock controls.
- Connections sidebar with search, compact persisted grouping, datastore icons, and persisted collapsible sections.
- Explorer is opened from a connection or object context menu instead of a permanent activity-bar item.
- Query editor area with tabs, context menus, simplified visible tab labels, dirty-state indicators, and query toolbar actions.
- Bottom panel with Results, Messages, Query History, and Details tabs.
- Right-side drawers for connection editing, diagnostics, operations, and inspection.

Opening or selecting a connection does not automatically create a query tab. Query tabs are opened explicitly from context menus or tab strip actions. Editing a connection is also explicit through the connection context menu or edit workflow.

## Connections And Environments

Connection profiles include:

- datastore engine and family
- host, port, database, username, local path, and connection string fields
- read-only mode
- tags and notes
- secret references instead of persisted raw passwords
- datastore-specific warnings and defaults

Creating a connection opens a draft form. No connection is added to the workspace until the user chooses **Save**.

Environment profiles include:

- label, color, and risk level
- variable values and sensitive-key redaction
- safe-mode and confirmation rules
- clone and save workflows

The environment list is presented directly without an extra Workspace grouping.

## Local Datastore Files

Local file-oriented datastores support create/open-style flows where the engine can reasonably support it:

- SQLite: open existing database files, create empty files, and create starter databases.
- DuckDB: open or create local analytical databases.
- LiteDB: create or open local `.db` files through the LiteDB bridge surface.

The create flow asks for a folder and a database name instead of requiring users to type one combined path manually.

## Explorer And Object Actions

Connections and explorer nodes expose datastore-aware object trees. Examples:

- SQL-family connections show database/schema/table/view/index/procedure-style objects where supported.
- MongoDB shows databases and collections.
- Redis/Valkey show key-oriented groups and typed key surfaces.
- Search engines show indices and data streams.
- DynamoDB shows tables and index-like children.
- Cassandra shows keyspaces, tables, indexes, and materialized views.

Object context menus can open scoped query tabs. Builder-capable objects open the same unified query window as raw query tabs; the toolbar controls whether the user sees Builder + Raw, Builder only, or Raw only.

## Query Editors And Builders

Query windows support raw editors and visual builders when an engine/family exposes a builder state.

Current builder types:

- MongoDB find builder with collection dropdown, grouped filters, AND/OR logic, filter enable/disable toggles, projection include/exclude controls, sort controls, and direct raw JSON synchronization.
- SQL SELECT builder for SQL-family table targets.
- DynamoDB key-condition builder.
- Cassandra CQL partition-key-first builder.
- Elasticsearch/OpenSearch query DSL builder.

Builder changes update the raw query immediately. Raw query and builder modes are layout choices, not separate tabs. Builder controls only appear for engines and scoped objects that support builders.

MongoDB document fields can be dragged from document results into builder drop targets:

- drop on Filters to create a filter using the field path and value
- drop on Projection to add a projection field
- drop on Sort to add an order field

## Results Workbench

Results are normalized into renderer-friendly payloads and then displayed in rich read-only or safely editable views.

Supported renderers include:

- table
- document
- JSON tree
- key-value
- search hits
- graph details
- raw payloads
- schema
- plans, profiles, metrics, series, and cost estimates

### Table Results

The table view follows common database-grid behavior:

- sticky headers and row-number gutter
- full-width grid surface
- buffered virtualization for large non-document result sets
- selected cell/row behavior
- local sort and filter controls for buffered rows
- copy cell/range/row/all as tab-separated text
- column resizing and compact null/empty value styling

Non-document result sets are not locally paged by the result UI. They render the buffered result with virtualization.

### Document Results

The document view uses a table/tree hybrid:

- each root row is labeled by the document id value, not `document 1`
- field/type/value columns are used for root and child rows
- object and array children are collapsed by default
- types are color-coded for quick scanning
- field names and values are draggable into query builders
- paging is available for document-family payloads

Inline editing is intentionally explicit. A user must double-click or choose an edit context-menu action before a field, value, or type becomes editable. Type cells render as plain badges until editing begins.

Supported safe document edits include field rename, field set/unset, value change, and type conversion when the backing datastore adapter can plan the edit safely. For MongoDB this maps to guarded document update operations.

### Key-Value And Search Results

Key-value renderers support typed value displays and edit planning for supported Redis/Valkey-style values. Search result renderers support hit/source display, tree inspection, and guarded document update/delete/index operation planning where the adapter supports it.

## Safe Edits And Operations

DataPad++ uses two classes of mutation:

- safe live data edits for natural row/document/key/item changes when the adapter can identify the target unambiguously
- guarded preview operation plans for destructive/admin/schema/cloud-cost workflows

Safe live edit examples:

- SQL row insert/update/delete only with clear table and primary-key context
- MongoDB document field set/unset/rename/type-change with a document id
- Redis/Valkey key value and TTL changes
- DynamoDB item changes with complete keys
- Cassandra row updates only when primary-key conditions are complete
- search document update/delete/index requests when index and id are known

Admin/destructive operations remain plan-first. Users should see generated SQL/API payloads, risk level, permission requirements, and confirmation text before execution is enabled.

## Diagnostics

Adapters can surface:

- connection-test warnings
- permissions and unavailable actions
- query plans and profiles
- metrics and chartable series
- query history and runtime
- cloud cost estimates or dry-run signals
- engine-specific stats such as `pg_stat*`, SQL Server DMV/Query Store, MongoDB explain/index stats, Redis INFO/SLOWLOG/ACL, Elasticsearch/OpenSearch profile/cat stats, DynamoDB capacity, and Cassandra tracing surfaces

Not every adapter has the same depth yet. Capability manifests and experience manifests define which diagnostics should be shown.

## Datastore Coverage

Core+popular engines are the current completion priority:

- PostgreSQL
- CockroachDB
- SQL Server / Azure SQL
- MySQL
- MariaDB
- SQLite
- MongoDB
- Redis / Valkey
- Elasticsearch / OpenSearch
- DynamoDB
- Cassandra

The broader catalog also includes Oracle, TimescaleDB, Cosmos DB, LiteDB, Memcached, Neo4j, Neptune, ArangoDB, JanusGraph, InfluxDB, Prometheus, OpenTSDB, ClickHouse, DuckDB, Snowflake, and BigQuery. Many of these have beta or contract-backed surfaces and local/mock fixtures.

## Docker Fixtures

The Docker fixture matrix provides repeatable seeded databases for debugging and integration testing:

- core default: PostgreSQL, MySQL, SQL Server, MongoDB, Redis, and SQLite file seed
- `cache`: Valkey and Memcached
- `sqlplus`: MariaDB, CockroachDB, TimescaleDB
- `analytics`: ClickHouse, InfluxDB, Prometheus, DuckDB seed
- `search`: OpenSearch and Elasticsearch
- `graph`: Neo4j, ArangoDB, JanusGraph
- `widecolumn`: Cassandra
- `oracle`: Oracle Free
- `cloud-contract`: DynamoDB Local plus HTTP mocks for BigQuery, Snowflake, Cosmos DB, and Neptune

See [Docker Fixtures](../tests/fixtures/README.md) for commands, ports, credentials, profiles, and resource expectations.

## Releases

Releases are manual GitHub Actions workflows with automated version updates:

1. Run the `Release` workflow with a semver version.
2. The workflow updates release version files.
3. It commits `chore: release v<version>`.
4. It creates or reuses `app-v<version>` at that commit.
5. It builds draft Tauri artifacts for Windows, Linux, macOS Intel, and macOS Apple Silicon.
6. It uploads installer/bundle outputs plus raw executable archives:
   - Windows x64: NSIS installer, MSI installer, zipped `.exe`.
   - Linux x64: `.deb`, `.rpm`, AppImage, tarred executable.
   - macOS Intel and Apple Silicon: app/DMG bundles plus tarred executable.

Release artifacts are draft-first so installers can be smoke-tested before publication.
