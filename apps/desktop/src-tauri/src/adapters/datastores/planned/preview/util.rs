use super::super::spec::BetaAdapterSpec;

pub(crate) fn spec_has(spec: &BetaAdapterSpec, capability: &str) -> bool {
    spec.capabilities.contains(&capability)
}

pub(crate) fn default_beta_query(spec: &BetaAdapterSpec) -> String {
    match spec.engine {
        "dynamodb" => "{\n  \"TableName\": \"Orders\",\n  \"KeyConditionExpression\": \"pk = :pk\",\n  \"ExpressionAttributeValues\": { \":pk\": { \"S\": \"CUSTOMER#123\" } },\n  \"Limit\": 25\n}".into(),
        "cassandra" => "select * from keyspace.table where partition_key = ? limit 25;".into(),
        "cosmosdb" => "select top 50 * from c".into(),
        "litedb" => "{\n  \"collection\": \"products\",\n  \"filter\": {},\n  \"limit\": 50\n}".into(),
        "valkey" => "SCAN 0 MATCH session:* COUNT 25".into(),
        "memcached" => "stats".into(),
        "neo4j" => "MATCH (n) RETURN n LIMIT 25".into(),
        "neptune" | "janusgraph" => "g.V().limit(25)".into(),
        "arango" => "FOR doc IN collection LIMIT 25 RETURN doc".into(),
        "influxdb" => "SELECT * FROM measurement LIMIT 25".into(),
        "prometheus" => "up".into(),
        "opentsdb" => "{\n  \"start\": \"1h-ago\",\n  \"queries\": [\n    { \"metric\": \"sys.cpu.user\", \"aggregator\": \"avg\" }\n  ]\n}".into(),
        "elasticsearch" | "opensearch" => "{\n  \"query\": { \"match_all\": {} },\n  \"size\": 25\n}".into(),
        "bigquery" | "snowflake" | "clickhouse" | "duckdb" | "oracle" | "timescaledb" => "select 1;".into(),
        _ => "".into(),
    }
}
