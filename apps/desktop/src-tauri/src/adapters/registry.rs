use super::contract::DatastoreAdapter;
use super::datastores::planned::{beta_adapter_for_engine, beta_manifests};
use super::datastores::{
    ArangoDbAdapter, BigQueryAdapter, CassandraAdapter, ClickHouseAdapter, CockroachAdapter,
    CosmosDbAdapter, DuckDbAdapter, DynamoDbAdapter, ElasticsearchAdapter, InfluxDbAdapter,
    JanusGraphAdapter, LiteDbAdapter, MemcachedAdapter, MongoDbAdapter, MysqlLikeAdapter,
    Neo4jAdapter, NeptuneAdapter, OpenSearchAdapter, OpenTsdbAdapter, OracleAdapter,
    PostgresAdapter, PrometheusAdapter, RedisAdapter, SnowflakeAdapter, SqlServerAdapter,
    SqliteAdapter, TimescaleAdapter, ValkeyAdapter,
};
use super::*;

pub fn manifests() -> Vec<AdapterManifest> {
    let mut manifests = vec![
        PostgresAdapter.manifest(),
        CockroachAdapter.manifest(),
        TimescaleAdapter.manifest(),
        SqlServerAdapter.manifest(),
        MysqlLikeAdapter { engine: "mysql" }.manifest(),
        MysqlLikeAdapter { engine: "mariadb" }.manifest(),
        SqliteAdapter.manifest(),
        OracleAdapter.manifest(),
        BigQueryAdapter.manifest(),
        ClickHouseAdapter.manifest(),
        CosmosDbAdapter.manifest(),
        CassandraAdapter.manifest(),
        DuckDbAdapter.manifest(),
        DynamoDbAdapter.manifest(),
        SnowflakeAdapter.manifest(),
        ElasticsearchAdapter.manifest(),
        OpenSearchAdapter.manifest(),
        ArangoDbAdapter.manifest(),
        PrometheusAdapter.manifest(),
        OpenTsdbAdapter.manifest(),
        InfluxDbAdapter.manifest(),
        Neo4jAdapter.manifest(),
        JanusGraphAdapter.manifest(),
        NeptuneAdapter.manifest(),
        LiteDbAdapter.manifest(),
        MongoDbAdapter.manifest(),
        RedisAdapter.manifest(),
        ValkeyAdapter.manifest(),
        MemcachedAdapter.manifest(),
    ];
    manifests.extend(beta_manifests());
    manifests
}

pub fn execution_capabilities(engine: &str) -> ExecutionCapabilities {
    match engine {
        "postgresql" => PostgresAdapter.execution_capabilities(),
        "cockroachdb" => CockroachAdapter.execution_capabilities(),
        "timescaledb" => TimescaleAdapter.execution_capabilities(),
        "sqlserver" => SqlServerAdapter.execution_capabilities(),
        "mysql" => MysqlLikeAdapter { engine: "mysql" }.execution_capabilities(),
        "mariadb" => MysqlLikeAdapter { engine: "mariadb" }.execution_capabilities(),
        "sqlite" => SqliteAdapter.execution_capabilities(),
        "oracle" => OracleAdapter.execution_capabilities(),
        "bigquery" => BigQueryAdapter.execution_capabilities(),
        "clickhouse" => ClickHouseAdapter.execution_capabilities(),
        "cosmosdb" => CosmosDbAdapter.execution_capabilities(),
        "cassandra" => CassandraAdapter.execution_capabilities(),
        "duckdb" => DuckDbAdapter.execution_capabilities(),
        "dynamodb" => DynamoDbAdapter.execution_capabilities(),
        "snowflake" => SnowflakeAdapter.execution_capabilities(),
        "elasticsearch" => ElasticsearchAdapter.execution_capabilities(),
        "opensearch" => OpenSearchAdapter.execution_capabilities(),
        "arango" => ArangoDbAdapter.execution_capabilities(),
        "prometheus" => PrometheusAdapter.execution_capabilities(),
        "opentsdb" => OpenTsdbAdapter.execution_capabilities(),
        "influxdb" => InfluxDbAdapter.execution_capabilities(),
        "neo4j" => Neo4jAdapter.execution_capabilities(),
        "janusgraph" => JanusGraphAdapter.execution_capabilities(),
        "neptune" => NeptuneAdapter.execution_capabilities(),
        "litedb" => LiteDbAdapter.execution_capabilities(),
        "mongodb" => MongoDbAdapter.execution_capabilities(),
        "redis" => RedisAdapter.execution_capabilities(),
        "valkey" => ValkeyAdapter.execution_capabilities(),
        "memcached" => MemcachedAdapter.execution_capabilities(),
        _ => beta_adapter_for_engine(engine)
            .map(|adapter| adapter.execution_capabilities())
            .unwrap_or_else(|| ExecutionCapabilities {
                can_cancel: false,
                can_explain: false,
                supports_live_metadata: false,
                editor_language: "text".into(),
                default_row_limit: 200,
            }),
    }
}

pub(crate) fn adapter_for_engine(engine: &str) -> Result<Box<dyn DatastoreAdapter>, CommandError> {
    match engine {
        "postgresql" => Ok(Box::new(PostgresAdapter)),
        "cockroachdb" => Ok(Box::new(CockroachAdapter)),
        "timescaledb" => Ok(Box::new(TimescaleAdapter)),
        "sqlserver" => Ok(Box::new(SqlServerAdapter)),
        "mysql" => Ok(Box::new(MysqlLikeAdapter { engine: "mysql" })),
        "mariadb" => Ok(Box::new(MysqlLikeAdapter { engine: "mariadb" })),
        "sqlite" => Ok(Box::new(SqliteAdapter)),
        "oracle" => Ok(Box::new(OracleAdapter)),
        "bigquery" => Ok(Box::new(BigQueryAdapter)),
        "clickhouse" => Ok(Box::new(ClickHouseAdapter)),
        "cosmosdb" => Ok(Box::new(CosmosDbAdapter)),
        "cassandra" => Ok(Box::new(CassandraAdapter)),
        "duckdb" => Ok(Box::new(DuckDbAdapter)),
        "dynamodb" => Ok(Box::new(DynamoDbAdapter)),
        "snowflake" => Ok(Box::new(SnowflakeAdapter)),
        "elasticsearch" => Ok(Box::new(ElasticsearchAdapter)),
        "opensearch" => Ok(Box::new(OpenSearchAdapter)),
        "arango" => Ok(Box::new(ArangoDbAdapter)),
        "prometheus" => Ok(Box::new(PrometheusAdapter)),
        "opentsdb" => Ok(Box::new(OpenTsdbAdapter)),
        "influxdb" => Ok(Box::new(InfluxDbAdapter)),
        "neo4j" => Ok(Box::new(Neo4jAdapter)),
        "janusgraph" => Ok(Box::new(JanusGraphAdapter)),
        "neptune" => Ok(Box::new(NeptuneAdapter)),
        "litedb" => Ok(Box::new(LiteDbAdapter)),
        "mongodb" => Ok(Box::new(MongoDbAdapter)),
        "redis" => Ok(Box::new(RedisAdapter)),
        "valkey" => Ok(Box::new(ValkeyAdapter)),
        "memcached" => Ok(Box::new(MemcachedAdapter)),
        _ => beta_adapter_for_engine(engine)
            .map(|adapter| Box::new(adapter) as Box<dyn DatastoreAdapter>)
            .ok_or_else(|| {
                CommandError::new(
                    "adapter-unsupported",
                    format!("No adapter is registered for engine `{engine}`."),
                )
            }),
    }
}
