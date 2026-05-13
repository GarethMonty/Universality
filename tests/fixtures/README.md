# Datanaut Docker Fixtures

This folder contains repeatable local fixtures for debugging and E2E testing datastore adapters.

## Commands

- Core fixtures: `npm run fixtures:up`
- Seed running fixtures: `npm run fixtures:seed`
- Start one optional profile: `npm run fixtures:up:profile -- <profile>`
- Start all optional profiles: `npm run fixtures:up:all`
- Seed all running/known profiles: `npm run fixtures:seed:all`
- Stop and remove volumes: `npm run fixtures:down`

Run seeded Rust fixture tests with:

```powershell
$env:DATANAUT_FIXTURE_RUN='1'
npm run rust:test
```

## Profiles

| Profile | Services | Notes |
| --- | --- | --- |
| default | PostgreSQL, MySQL, SQL Server, MongoDB, Redis, SQLite file | Fast path used by existing E2E. |
| `cache` | Valkey, Memcached | Lightweight cache fixtures. |
| `sqlplus` | MariaDB, CockroachDB, TimescaleDB | Additional SQL and PostgreSQL-wire engines. |
| `analytics` | ClickHouse, InfluxDB, Prometheus, DuckDB file | OLAP/time-series fixtures. |
| `search` | OpenSearch, Elasticsearch | Single-node, security-disabled, memory-limited. |
| `graph` | Neo4j, ArangoDB, JanusGraph | JanusGraph is heavier and may take longer to settle. |
| `widecolumn` | Cassandra | Heavy JVM service. |
| `oracle` | Oracle Free | Very heavy; start explicitly. |
| `cloud-contract` | DynamoDB Local, HTTP mocks for BigQuery/Snowflake/Cosmos DB/Neptune | Local substitutes for cloud-managed APIs. |

## Default Ports And Credentials

The fixture runner writes the actual ports it selected to `tests/fixtures/.generated.env`.
If a default port is blocked or reserved by Windows, the runner automatically chooses a nearby
available fallback and the debug fixture workspace reads that generated file. You can still force
a port by setting the matching environment variable before running `fixtures:up`, for example:

```powershell
$env:DATANAUT_POSTGRES_PORT='55432'
npm run fixtures:up
```

| Engine | Host Port | Database | User | Password |
| --- | ---: | --- | --- | --- |
| PostgreSQL | `DATANAUT_POSTGRES_PORT` or 54329 | datanaut | datanaut | datanaut |
| MySQL | 33060 | commerce | datanaut | datanaut |
| SQL Server | 14333 | datanaut | sa | Datanaut_pwd_123 |
| MongoDB | 27018 | catalog | datanaut | datanaut |
| Redis | 6380 | 0 | | |
| Valkey | 6381 | 0 | | |
| Memcached | 11212 | | | |
| MariaDB | 33061 | commerce | datanaut | datanaut |
| CockroachDB | 26257 | datanaut | root/insecure | |
| TimescaleDB | 54330 | metrics | datanaut | datanaut |
| ClickHouse | 8124 | analytics | datanaut | datanaut |
| InfluxDB | 8087 | metrics | | |
| Prometheus | 9091 | | | |
| OpenSearch | 9201 | | | |
| Elasticsearch | 9202 | | | |
| Neo4j | 7475 / 7688 | neo4j | neo4j | datanaut |
| ArangoDB | 8529 | datanaut | root | datanaut |
| Cassandra | 9043 | datanaut | | |
| JanusGraph | 8183 | | | |
| Oracle Free | 1522 | FREEPDB1 | datanaut | datanaut |
| DynamoDB Local | 8001 | sharedDb | local | local |
| BigQuery mock | 19050 | analytics | token in password field | fixture-token |
| Snowflake mock | 19060 | DATANAUT | token in password field | fixture-token |
| Cosmos DB mock | 19070 | datanaut | | fixture-token |
| Neptune mock | 19080 | | | |

Seed data uses a small shared domain: accounts, products, orders/transactions, sessions, events, metrics, and alerts. Scripts are designed to be safe to rerun.

## Performance Seed Data

The core fixtures also include deterministic high-volume data for paging, virtualization, copy/export, and explorer performance testing:

| Engine | Object | Default volume |
| --- | --- | ---: |
| PostgreSQL | `observability.perf_events` | 100,000 rows |
| MySQL | `perf_inventory_events` | 100,000 rows |
| SQL Server | `dbo.perf_events` | 100,000 rows |
| SQLite | `perf_events` | 100,000 rows |
| MongoDB | `catalog.perfDocuments` | 100,000 documents |
| Redis | `perf:session:*` plus `perf:manifest` | 50,000 keys |
| MariaDB (`sqlplus`) | `perf_order_events` | 100,000 rows |
| Valkey (`cache`) | `perf:session:*` plus `perf:manifest` | 50,000 keys |

Redis/Valkey key volume can be overridden for local experiments with `DATANAUT_REDIS_PERF_KEYS`.

## Resource Expectations

The default stack is intended for everyday debugging. `oracle`, `widecolumn`, `graph`, and `search` can consume several GB of memory and should be started only when needed. `fixtures:up:all` is deliberately opt-in.
