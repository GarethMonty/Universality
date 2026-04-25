# Universality Docker Fixtures

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
$env:UNIVERSALITY_FIXTURE_RUN='1'
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

| Engine | Host Port | Database | User | Password |
| --- | ---: | --- | --- | --- |
| PostgreSQL | 54329 | universality | universality | universality |
| MySQL | 33060 | commerce | universality | universality |
| SQL Server | 14333 | universality | sa | Universality_pwd_123 |
| MongoDB | 27018 | catalog | universality | universality |
| Redis | 6380 | 0 | | |
| Valkey | 6381 | 0 | | |
| Memcached | 11212 | | | |
| MariaDB | 33061 | commerce | universality | universality |
| CockroachDB | 26257 | universality | root/insecure | |
| TimescaleDB | 54330 | metrics | universality | universality |
| ClickHouse | 8124 | analytics | universality | universality |
| InfluxDB | 8087 | metrics | | |
| Prometheus | 9091 | | | |
| OpenSearch | 9201 | | | |
| Elasticsearch | 9202 | | | |
| Neo4j | 7475 / 7688 | neo4j | neo4j | universality |
| ArangoDB | 8529 | universality | root | universality |
| Cassandra | 9043 | universality | | |
| JanusGraph | 8183 | | | |
| Oracle Free | 1522 | FREEPDB1 | universality | universality |
| DynamoDB Local | 8001 | sharedDb | local | local |
| BigQuery mock | 19050 | analytics | token in password field | fixture-token |
| Snowflake mock | 19060 | UNIVERSALITY | token in password field | fixture-token |
| Cosmos DB mock | 19070 | universality | | fixture-token |
| Neptune mock | 19080 | | | |

Seed data uses a small shared domain: accounts, products, orders/transactions, sessions, events, metrics, and alerts. Scripts are designed to be safe to rerun.

## Resource Expectations

The default stack is intended for everyday debugging. `oracle`, `widecolumn`, `graph`, and `search` can consume several GB of memory and should be started only when needed. `fixtures:up:all` is deliberately opt-in.
