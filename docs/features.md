# DataPad++ Feature Guide

DataPad++ is a desktop workbench for databases and datastores. It is built for developers, analysts, support engineers, and operators who need to move between different data systems without changing tools every few minutes.

This guide focuses on what the application lets you do. For implementation details, see the architecture and contributing docs.

## The Everyday Workflow

Most work in DataPad++ follows a simple flow:

1. Create or choose a connection.
2. Pick the environment you are working in.
3. Explore the available objects.
4. Open a query or browser tab for the object you care about.
5. Run, inspect, edit safely where supported, and save useful work into the Library.

The app is intentionally local-first. Your workspace, saved work, and connection profiles live on your machine, and secrets are handled through desktop-safe storage where available.

## Connections

Connections are the starting point for every datastore. A connection profile can include the datastore type, host, port, database name, local file path, connection string, tags, notes, and read-only settings.

DataPad++ supports several connection styles depending on the datastore:

- host, port, database, username, and password
- connection strings for engines that support them
- local database files for file-backed engines such as SQLite, DuckDB, and LiteDB-style workflows
- cloud-style or SDK-backed connection flows where those adapters are available

Creating a connection does not immediately add it to the workspace. You can fill out the form, test it, adjust it, and save only when it is ready.

## Environments

Environments help keep context visible. A connection or Library folder can be associated with an environment such as Local, Development, QA, Stage, or Production.

Environments can provide:

- a label and color
- a risk level
- variables used in connection strings or queries
- safe-mode behavior
- confirmation rules for risky actions

When folders in the Library have environments, child folders and files inherit the closest environment unless they override it. This makes it easier to keep related scripts and queries aligned with the right target.

## Exploring Datastores

The Connections panel and Explorer tabs let you browse a datastore before querying it. The tree changes based on the datastore type.

For SQL databases, DataPad++ can show objects such as:

- databases
- schemas
- tables
- views
- columns
- indexes
- functions
- stored procedures where supported

For MongoDB, it can show:

- databases
- collections
- indexes
- document samples and inferred shapes

For Redis and Valkey, it can show:

- key groups
- key names
- types
- TTL information
- memory usage
- typed value previews

For search engines, it can show:

- indexes
- mappings
- aliases
- data streams
- search result structures

For wide-column stores such as Cassandra, it can show:

- keyspaces
- tables
- primary-key structure
- indexes
- materialized views

Object menus provide relevant actions for the selected item. A table, collection, key, index, or folder should expose actions that make sense for that kind of object.

## Querying

DataPad++ supports both raw query editors and visual query builders.

Raw editors are useful when you already know the query language. Visual builders help when the datastore has a common query shape or when you want to build from existing result fields.

Current query experiences include:

- SQL editors for relational databases
- SQL SELECT builder for table-focused queries
- MongoDB find builder
- Redis and Valkey key browser
- Elasticsearch/OpenSearch query builder
- DynamoDB key-condition builder
- Cassandra partition-key builder

When a builder is available, the toolbar can switch between:

- Builder and Raw
- Builder only
- Raw only

The builder and raw query stay synchronized, so the visual view can teach you the underlying query instead of hiding it.

## MongoDB Experience

MongoDB gets a document-first workflow.

You can:

- browse databases and collections
- open a collection directly into a Mongo find builder
- choose a collection from a dropdown
- add filters with AND/OR grouping
- turn filters on and off without deleting them
- add projections and sort fields
- control result size through paging
- view documents as expandable rows
- drag document fields into filters, projections, or sort
- edit fields, values, and types where safe
- inspect JSON and raw result output

Document editing is deliberate. You double-click to edit, and the app only enables edits when the adapter can identify the document safely.

## Redis And Valkey Experience

Redis and Valkey use a key-browser workflow by default instead of starting with a blank command console.

The Redis browser includes:

- key pattern filtering
- key type filtering
- tree and list views
- scan progress
- Scan more
- refresh
- typed badges
- TTL, memory, and length columns
- add key and delete key actions
- type-aware result views

Selecting a key opens its value in the Results panel. DataPad++ can inspect common Redis types such as strings, hashes, lists, sets, sorted sets, and streams. Redis Stack-style types such as JSON, TimeSeries, and probabilistic structures are detected when the server supports them, with unsupported actions shown as unavailable instead of failing mysteriously.

Raw Redis commands are still available from the query toolbar when you need the console.

## SQL Experience

SQL-family databases use familiar table and query workflows.

You can:

- browse schemas and tables
- open scoped queries from tables and views
- run raw SQL
- use a SELECT builder for simple table queries
- inspect result tables with a grid-like interface
- copy selected cells or rows with keyboard shortcuts
- view schema and diagnostics where supported
- plan table, column, index, and admin operations behind guardrails

DataPad++ aims to respect each SQL dialect. PostgreSQL, SQL Server, MySQL, MariaDB, SQLite, and CockroachDB have different identifier rules, metadata surfaces, and diagnostics. The app should guide you instead of pretending they are all identical.

## Search Experience

For Elasticsearch and OpenSearch, DataPad++ focuses on search-oriented workflows.

You can:

- browse indexes, data streams, and mappings
- build search queries visually
- inspect search hits, source documents, highlights, and aggregations
- switch to raw query DSL
- view profile, explain, shard, index, and cluster diagnostics where supported
- plan index and mapping operations behind safety prompts

## Results

The Results panel is one of the main parts of the app. It is designed for repeated database work, not just showing a blob of JSON.

### Table Results

Table results support:

- full-width grids
- sticky column headers
- row numbers
- row and cell selection
- keyboard copy shortcuts
- column resizing
- large-result virtualization
- compact display for null and empty values

Selecting the row-number column selects the full row.

### Document Results

Document results combine a table and a tree:

- root rows are named by document id
- children expand and collapse
- type values use color
- fields can be dragged into query builders
- editing starts only on double-click or explicit context-menu actions
- document-family results can page through large responses

### Key-Value Results

Key-value results show the selected key or item with useful metadata. For Redis and Valkey, this includes type, TTL, memory, encoding, length, and a bounded value sample.

### JSON, Raw, Details, And History

You can switch between rich renderers and raw payloads when needed. Messages, details, and query history live in the bottom panel so they are close to the result that produced them.

## Library

The Library replaces a simple saved-query list with a richer workspace for reusable work.

You can save:

- queries
- scripts
- snippets
- notes
- bookmarks
- snapshots

The Library supports folders, nested folders, drag-and-drop moves, rename/delete actions, recents, and environment inheritance. Saving a query can target either the Library or a local file.

## Safe Editing

DataPad++ supports live edits only where the target is clear and the datastore can be updated safely.

Examples:

- SQL row edits need table and primary-key context
- MongoDB document edits need collection and document id context
- Redis key edits need a concrete key
- DynamoDB item edits need complete key conditions
- Cassandra row edits need complete primary-key conditions

When DataPad++ cannot prove the target is safe, the action is disabled or shown as a preview plan instead of being executed silently.

## Operations And Diagnostics

Some work is not a simple query or edit. DataPad++ can expose operation previews and diagnostics where adapters support them.

Examples include:

- execution plans
- query profiles
- slow-query or query-history panels
- permission inspection
- session and lock information
- index and storage stats
- Redis INFO, SLOWLOG, ACL, and memory information
- search-engine profile and shard details
- cloud dry-run or cost estimates where available

Destructive or administrative actions should be previewed first, with the generated SQL, command, or API request visible before execution is allowed.

## Datastore Coverage

DataPad++ is growing in layers.

### Main Completion Focus

These engines are the main product focus:

- PostgreSQL
- CockroachDB
- SQL Server and Azure SQL
- MySQL
- MariaDB
- SQLite
- MongoDB
- Redis and Valkey
- Elasticsearch and OpenSearch
- DynamoDB
- Cassandra

### Broader Roadmap

The broader roadmap includes:

- Oracle
- TimescaleDB
- Cosmos DB
- LiteDB
- Memcached
- Neo4j
- Amazon Neptune
- ArangoDB
- JanusGraph
- InfluxDB
- Prometheus
- OpenTSDB
- ClickHouse
- DuckDB
- Snowflake
- BigQuery

Some roadmap adapters are available as beta, preview, local fixture, mock, or read-oriented experiences while live production workflows are hardened.

## Sample Data And Fixtures

For contributors and testers, the repository includes repeatable Docker fixtures with seeded sample data.

The default fixture set includes PostgreSQL, MySQL, SQL Server, MongoDB, Redis, and SQLite. Optional profiles add Redis Stack, search engines, cache stores, analytics stores, graph stores, Cassandra, Oracle, and cloud-contract mocks.

See [Docker Fixtures](../tests/fixtures/README.md) for setup commands and connection details.

## Releases

Desktop releases are produced through GitHub Actions and attached to GitHub Releases as draft-reviewed artifacts.

Look for platform assets such as:

- Windows: NSIS installer, MSI installer, or zipped executable
- Linux: `.deb`, `.rpm`, AppImage, or tarred executable
- macOS Apple Silicon: DMG or app bundle artifact

GitHub also displays automatic source-code zip/tar archives. Those are normal GitHub files, but they are not the desktop app installers.
