# Adapter Model

Datanaut uses a capability-driven adapter system so the desktop app can add new datastore engines without rewriting the shell.

## Adapter contract

Every adapter should supply:

- identity metadata
- connection schema and validation rules
- capability declarations
- metadata discovery handlers
- query or command execution handlers
- result serializers
- error normalization

Optional capabilities can add:

- explain plans
- visual query builders
- transaction controls
- key browser actions
- graph rendering hints
- time-series aggregation helpers

## Capability-first UI

The UI should react to declared capabilities rather than engine names alone.

Examples:

- `supports_sql_editor` enables Monaco SQL tooling
- `supports_document_view` enables document and JSON-first inspection
- `supports_key_browser` enables Redis-style key navigation and TTL management
- `supports_graph_view` enables node-edge visualization
- `supports_time_series_charting` enables chart-centric result rendering
- `supports_explain_plan` enables plan analysis actions

## Result normalization

Adapters should normalize outputs into renderer-friendly envelopes:

- tabular datasets
- structured documents
- key-value objects
- graph nodes and edges
- chartable series
- raw protocol responses

## MVP recommendation

The first adapter set should focus on:

- PostgreSQL
- SQL Server
- MySQL / MariaDB
- SQLite
- MongoDB
- Redis
