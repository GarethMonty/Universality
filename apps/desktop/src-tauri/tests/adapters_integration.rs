use std::collections::BTreeSet;
use std::env;

use sqlx::Executor;
use universality_desktop_lib::{
    adapters,
    domain::{
        error::CommandError,
        models::{ExecutionRequest, ExplorerRequest, ResolvedConnectionProfile, ResultPageRequest},
    },
};

fn fixtures_enabled() -> bool {
    env::var("UNIVERSALITY_FIXTURE_RUN").unwrap_or_default() == "1"
}

fn env_or(key: &str, fallback: &str) -> String {
    env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn execution_request(
    connection_id: &str,
    environment_id: &str,
    language: &str,
    query_text: &str,
) -> ExecutionRequest {
    ExecutionRequest {
        execution_id: None,
        tab_id: format!("tab-{connection_id}"),
        connection_id: connection_id.to_string(),
        environment_id: environment_id.to_string(),
        language: language.to_string(),
        query_text: query_text.to_string(),
        selected_text: None,
        mode: Some("full".into()),
        row_limit: Some(25),
        confirmed_guardrail_id: None,
    }
}

fn result_page_request(
    connection_id: &str,
    environment_id: &str,
    language: &str,
    query_text: &str,
) -> ResultPageRequest {
    ResultPageRequest {
        tab_id: format!("tab-{connection_id}"),
        connection_id: connection_id.to_string(),
        environment_id: environment_id.to_string(),
        language: language.to_string(),
        query_text: query_text.to_string(),
        selected_text: None,
        renderer: "table".into(),
        page_size: Some(50),
        page_index: Some(1),
        cursor: None,
    }
}

fn resolved_connection(engine: &str, family: &str) -> ResolvedConnectionProfile {
    ResolvedConnectionProfile {
        id: format!("conn-{engine}"),
        name: format!("Fixture {engine}"),
        engine: engine.into(),
        family: family.into(),
        host: "127.0.0.1".into(),
        port: None,
        database: Some("universality".into()),
        username: Some("universality".into()),
        password: Some("universality".into()),
        connection_string: None,
        read_only: true,
    }
}

#[tokio::test]
async fn every_registered_adapter_has_consistent_operation_contracts() -> Result<(), CommandError> {
    for manifest in adapters::manifests() {
        let connection = resolved_connection(&manifest.engine, &manifest.family);
        let operations = adapters::operation_manifests(&connection)?;
        assert!(
            !operations.is_empty(),
            "{} should expose at least baseline operations",
            manifest.engine
        );

        let mut ids = BTreeSet::new();
        for operation in &operations {
            assert!(
                ids.insert(operation.id.clone()),
                "{} has duplicate operation id {}",
                manifest.engine,
                operation.id
            );
            assert_eq!(operation.engine, manifest.engine);
            assert_eq!(operation.family, manifest.family);
            assert!(
                operation
                    .required_capabilities
                    .iter()
                    .all(|capability| manifest.capabilities.contains(capability)),
                "{} operation {} declares a capability missing from the manifest",
                manifest.engine,
                operation.id
            );
            assert!(
                !operation.supported_renderers.is_empty(),
                "{} operation {} needs at least one renderer",
                manifest.engine,
                operation.id
            );
        }

        let permissions = adapters::inspect_permissions(&connection).await?;
        assert_eq!(permissions.engine, manifest.engine);
        for unavailable in permissions.unavailable_actions {
            assert!(
                ids.contains(&unavailable.operation_id),
                "{} unavailable action references unknown operation {}",
                manifest.engine,
                unavailable.operation_id
            );
            assert!(!unavailable.reason.trim().is_empty());
        }
    }

    Ok(())
}

#[tokio::test]
async fn guarded_operation_plans_include_confirmation_and_permission_warnings(
) -> Result<(), CommandError> {
    for (engine, family, operation_id) in [
        ("postgresql", "sql", "postgresql.object.drop"),
        ("cockroachdb", "sql", "cockroachdb.query.profile"),
        ("mongodb", "document", "mongodb.object.drop"),
        ("bigquery", "warehouse", "bigquery.data.import-export"),
    ] {
        let connection = resolved_connection(engine, family);
        let plan = adapters::plan_operation(&connection, operation_id, None, None).await?;

        assert_eq!(plan.engine, engine);
        assert!(
            plan.confirmation_text.is_some(),
            "{operation_id} should require confirmation for read-only/costly/destructive profiles"
        );
        assert!(
            !plan.required_permissions.is_empty(),
            "{operation_id} should tell the UI which permissions are required"
        );
        assert!(
            !plan.warnings.is_empty(),
            "{operation_id} should surface user-facing warnings"
        );
    }

    Ok(())
}

#[test]
fn manifests_register_cockroach_and_beta_adapters() {
    let manifests = adapters::manifests();
    assert!(
        manifests
            .iter()
            .all(|manifest| manifest.maturity == "mvp" || manifest.maturity == "beta"),
        "runtime registry should not emit generic planned manifests after concrete adapter promotion"
    );
    let cockroach = manifests
        .iter()
        .find(|manifest| manifest.engine == "cockroachdb")
        .expect("cockroachdb manifest");

    assert_eq!(cockroach.maturity, "mvp");
    assert_eq!(cockroach.family, "sql");
    assert_eq!(cockroach.default_language, "sql");
    assert!(cockroach
        .capabilities
        .iter()
        .any(|capability| capability == "supports_cloud_iam"));

    for engine in [
        "oracle",
        "dynamodb",
        "cassandra",
        "cosmosdb",
        "litedb",
        "elasticsearch",
        "opensearch",
        "clickhouse",
        "valkey",
        "memcached",
        "duckdb",
        "snowflake",
        "bigquery",
    ] {
        let manifest = manifests
            .iter()
            .find(|manifest| manifest.engine == engine)
            .unwrap_or_else(|| panic!("{engine} manifest"));
        assert_eq!(manifest.maturity, "beta");
        assert!(!manifest.capabilities.is_empty());
    }
}

#[tokio::test]
async fn beta_adapter_contract_surfaces_operations_permissions_and_diagnostics(
) -> Result<(), CommandError> {
    let connection = resolved_connection("bigquery", "warehouse");
    let test_result = adapters::test_connection(&connection, Vec::new()).await?;
    assert!(test_result.ok);

    let explorer = adapters::list_explorer_nodes(
        &connection,
        &ExplorerRequest {
            connection_id: connection.id.clone(),
            environment_id: "env-dev".into(),
            limit: Some(20),
            scope: None,
        },
    )
    .await?;
    assert!(!explorer.nodes.is_empty());

    let operations = adapters::operation_manifests(&connection)?;
    assert!(operations
        .iter()
        .any(|operation| operation.id == "bigquery.diagnostics.metrics"));

    let permissions = adapters::inspect_permissions(&connection).await?;
    assert!(!permissions.unavailable_actions.is_empty());

    let diagnostics = adapters::collect_diagnostics(&connection, None).await?;
    assert!(!diagnostics.metrics.is_empty());
    assert!(!diagnostics.cost_estimates.is_empty());

    let result = adapters::execute(
        &connection,
        &execution_request(&connection.id, "env-dev", "google-sql", "select 1;"),
        Vec::new(),
    )
    .await?;
    assert_eq!(result.engine, "bigquery");
    assert!(result.payloads.iter().any(|payload| payload
        .get("renderer")
        .and_then(|value| value.as_str())
        == Some("costEstimate")));

    let mut large_limit_request =
        execution_request(&connection.id, "env-dev", "google-sql", "select 1;");
    large_limit_request.row_limit = Some(99_999);
    let large_limit_result =
        adapters::execute(&connection, &large_limit_request, Vec::new()).await?;
    assert_eq!(
        large_limit_result
            .page_info
            .expect("beta result page info")
            .page_size,
        5_000
    );
    Ok(())
}

#[tokio::test]
async fn concrete_preview_adapters_surface_contract_without_live_fixture(
) -> Result<(), CommandError> {
    let manifests = adapters::manifests();

    for (engine, family, maturity) in [
        ("timescaledb", "timeseries", "beta"),
        ("oracle", "sql", "beta"),
        ("bigquery", "warehouse", "beta"),
        ("clickhouse", "warehouse", "beta"),
        ("cosmosdb", "document", "beta"),
        ("cassandra", "widecolumn", "beta"),
        ("litedb", "document", "beta"),
        ("duckdb", "embedded-olap", "beta"),
        ("dynamodb", "widecolumn", "beta"),
        ("snowflake", "warehouse", "beta"),
        ("elasticsearch", "search", "beta"),
        ("opensearch", "search", "beta"),
        ("arango", "graph", "beta"),
        ("neo4j", "graph", "beta"),
        ("janusgraph", "graph", "beta"),
        ("neptune", "graph", "beta"),
        ("prometheus", "timeseries", "beta"),
        ("opentsdb", "timeseries", "beta"),
        ("influxdb", "timeseries", "beta"),
        ("valkey", "keyvalue", "beta"),
        ("memcached", "keyvalue", "beta"),
    ] {
        let manifest = manifests
            .iter()
            .find(|manifest| manifest.engine == engine)
            .unwrap_or_else(|| panic!("{engine} manifest"));
        assert_eq!(manifest.family, family);
        assert_eq!(manifest.maturity, maturity);
        assert!(!manifest.capabilities.is_empty());

        let connection = resolved_connection(engine, family);
        let capabilities = adapters::execution_capabilities(engine);
        assert!(capabilities.supports_live_metadata);

        let operations = adapters::operation_manifests(&connection)?;
        assert!(operations
            .iter()
            .any(|operation| operation.id == format!("{engine}.diagnostics.metrics")));
        if maturity == "beta" {
            assert!(operations
                .iter()
                .filter(|operation| matches!(operation.risk.as_str(), "write" | "destructive"))
                .all(|operation| operation.preview_only == Some(true)));
        }

        let permissions = adapters::inspect_permissions(&connection).await?;
        assert_eq!(permissions.engine, engine);
        assert!(!permissions.unavailable_actions.is_empty());

        let diagnostics = adapters::collect_diagnostics(&connection, None).await?;
        assert_eq!(diagnostics.engine, engine);
        assert!(!diagnostics.metrics.is_empty());
    }

    Ok(())
}

#[tokio::test]
async fn preview_adapters_fail_safely_before_network_for_invalid_or_risky_commands(
) -> Result<(), CommandError> {
    let memcached = resolved_connection("memcached", "keyvalue");
    let memcached_result = adapters::execute(
        &memcached,
        &execution_request(
            &memcached.id,
            "env-dev",
            "plaintext",
            "set sample 0 60 5\r\nvalue",
        ),
        Vec::new(),
    )
    .await;
    let memcached_error = match memcached_result {
        Ok(_) => panic!("memcached writes must be preview-only"),
        Err(error) => error,
    };
    assert_eq!(memcached_error.code, "memcached-write-preview-only");

    let redis = resolved_connection("redis", "keyvalue");
    let redis_write_result = adapters::execute(
        &redis,
        &execution_request(&redis.id, "env-dev", "redis", "SET sample value"),
        Vec::new(),
    )
    .await;
    let redis_write_error = match redis_write_result {
        Ok(_) => panic!("redis writes must be preview-only"),
        Err(error) => error,
    };
    assert_eq!(redis_write_error.code, "redis-write-preview-only");

    let redis_unsupported_result = adapters::execute(
        &redis,
        &execution_request(&redis.id, "env-dev", "redis", "EVAL return 1 0"),
        Vec::new(),
    )
    .await;
    let redis_unsupported_error = match redis_unsupported_result {
        Ok(_) => panic!("unsupported redis commands must fail before network use"),
        Err(error) => error,
    };
    assert_eq!(redis_unsupported_error.code, "redis-command-unsupported");

    let clickhouse = resolved_connection("clickhouse", "warehouse");
    let clickhouse_result = adapters::execute(
        &clickhouse,
        &execution_request(&clickhouse.id, "env-dev", "clickhouse-sql", "   "),
        Vec::new(),
    )
    .await;
    let clickhouse_error = match clickhouse_result {
        Ok(_) => panic!("empty ClickHouse query must fail before network"),
        Err(error) => error,
    };
    assert_eq!(clickhouse_error.code, "clickhouse-query-missing");

    Ok(())
}

#[tokio::test]
async fn concrete_preview_adapters_return_safe_non_cursor_page_responses(
) -> Result<(), CommandError> {
    for (engine, family, language) in [
        ("bigquery", "warehouse", "google-sql"),
        ("oracle", "sql", "sql"),
        ("clickhouse", "warehouse", "clickhouse-sql"),
        ("cosmosdb", "document", "sql"),
        ("cassandra", "widecolumn", "cql"),
        ("litedb", "document", "json"),
        ("duckdb", "embedded-olap", "sql"),
        ("dynamodb", "widecolumn", "json"),
        ("snowflake", "warehouse", "snowflake-sql"),
        ("elasticsearch", "search", "query-dsl"),
        ("opensearch", "search", "query-dsl"),
        ("arango", "graph", "aql"),
        ("neo4j", "graph", "cypher"),
        ("janusgraph", "graph", "gremlin"),
        ("neptune", "graph", "gremlin"),
        ("prometheus", "timeseries", "promql"),
        ("opentsdb", "timeseries", "opentsdb"),
        ("influxdb", "timeseries", "influxql"),
        ("memcached", "keyvalue", "plaintext"),
    ] {
        let connection = resolved_connection(engine, family);
        let response = adapters::fetch_result_page(
            &connection,
            &result_page_request(&connection.id, "env-dev", language, "select 1"),
        )
        .await?;

        assert_eq!(response.tab_id, format!("tab-{}", connection.id));
        assert!(!response.page_info.has_more);
        assert_eq!(
            response
                .payload
                .get("renderer")
                .and_then(|value| value.as_str()),
            Some("raw")
        );
        assert!(response
            .notices
            .iter()
            .any(|notice| notice.contains("non-cursor result")));
    }

    Ok(())
}

#[tokio::test]
async fn cockroach_operation_plans_include_cluster_specific_templates() -> Result<(), CommandError>
{
    let connection = resolved_connection("cockroachdb", "sql");
    let operations = adapters::operation_manifests(&connection)?;
    assert!(operations
        .iter()
        .any(|operation| operation.id == "cockroachdb.cockroach.contention"));

    let plan =
        adapters::plan_operation(&connection, "cockroachdb.cockroach.contention", None, None)
            .await?;
    assert!(plan.generated_request.contains("show sessions"));
    assert!(plan
        .estimated_scan_impact
        .as_deref()
        .unwrap_or_default()
        .contains("crdb_internal"));
    Ok(())
}

#[tokio::test]
async fn postgres_adapter_fixture_roundtrip() -> Result<(), CommandError> {
    if !fixtures_enabled() {
        return Ok(());
    }

    let connection = ResolvedConnectionProfile {
        id: "conn-postgres".into(),
        name: "Fixture Postgres".into(),
        engine: "postgresql".into(),
        family: "sql".into(),
        host: env_or("UNIVERSALITY_POSTGRES_HOST", "127.0.0.1"),
        port: Some(
            env_or("UNIVERSALITY_POSTGRES_PORT", "54329")
                .parse()
                .unwrap_or(54329),
        ),
        database: Some(env_or("UNIVERSALITY_POSTGRES_DB", "universality")),
        username: Some(env_or("UNIVERSALITY_POSTGRES_USER", "universality")),
        password: Some(env_or("UNIVERSALITY_POSTGRES_PASSWORD", "universality")),
        connection_string: None,
        read_only: false,
    };

    let test_result = adapters::test_connection(&connection, Vec::new())
        .await
        .map_err(|error| CommandError::new("sqlite-test-connection", error.message))?;
    assert!(test_result.ok);

    let explorer = adapters::list_explorer_nodes(
        &connection,
        &ExplorerRequest {
            connection_id: connection.id.clone(),
            environment_id: "env-dev".into(),
            limit: Some(20),
            scope: None,
        },
    )
    .await
    .map_err(|error| CommandError::new("sqlite-test-explorer", error.message))?;
    assert!(!explorer.nodes.is_empty());

    let result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-dev",
            "sql",
            "select table_name from observability.table_health order by rows_estimate desc limit 2;",
        ),
        Vec::new(),
    )
    .await
    .map_err(|error| CommandError::new("sqlite-test-execution", error.message))?;
    assert_eq!(result.engine, "postgresql");
    assert!(!result.payloads.is_empty());
    Ok(())
}

#[tokio::test]
async fn sqlserver_adapter_fixture_roundtrip() -> Result<(), CommandError> {
    if !fixtures_enabled() {
        return Ok(());
    }

    let connection = ResolvedConnectionProfile {
        id: "conn-sqlserver".into(),
        name: "Fixture SQL Server".into(),
        engine: "sqlserver".into(),
        family: "sql".into(),
        host: env_or("UNIVERSALITY_SQLSERVER_HOST", "127.0.0.1"),
        port: Some(
            env_or("UNIVERSALITY_SQLSERVER_PORT", "14333")
                .parse()
                .unwrap_or(14333),
        ),
        database: Some(env_or("UNIVERSALITY_SQLSERVER_DB", "universality")),
        username: Some(env_or("UNIVERSALITY_SQLSERVER_USER", "sa")),
        password: Some(env_or(
            "UNIVERSALITY_SQLSERVER_PASSWORD",
            "Universality_pwd_123",
        )),
        connection_string: None,
        read_only: false,
    };

    let test_result = adapters::test_connection(&connection, Vec::new()).await?;
    assert!(test_result.ok);

    let result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-dev",
            "sql",
            "select top 2 order_id, status from dbo.orders order by updated_at desc;",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(result.engine, "sqlserver");
    assert!(!result.payloads.is_empty());
    Ok(())
}

#[tokio::test]
async fn mysql_adapter_fixture_roundtrip() -> Result<(), CommandError> {
    if !fixtures_enabled() {
        return Ok(());
    }

    let connection = ResolvedConnectionProfile {
        id: "conn-mysql".into(),
        name: "Fixture MySQL".into(),
        engine: "mysql".into(),
        family: "sql".into(),
        host: env_or("UNIVERSALITY_MYSQL_HOST", "127.0.0.1"),
        port: Some(
            env_or("UNIVERSALITY_MYSQL_PORT", "33060")
                .parse()
                .unwrap_or(33060),
        ),
        database: Some(env_or("UNIVERSALITY_MYSQL_DB", "commerce")),
        username: Some(env_or("UNIVERSALITY_MYSQL_USER", "universality")),
        password: Some(env_or("UNIVERSALITY_MYSQL_PASSWORD", "universality")),
        connection_string: None,
        read_only: false,
    };

    let test_result = adapters::test_connection(&connection, Vec::new()).await?;
    assert!(test_result.ok);

    let result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-dev",
            "sql",
            "select sku, inventory_available from inventory_items order by updated_at desc limit 2;",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(result.engine, "mysql");
    assert!(!result.payloads.is_empty());
    Ok(())
}

#[tokio::test]
async fn sqlite_adapter_fixture_roundtrip() -> Result<(), CommandError> {
    let sqlite_url = "sqlite://file:universality-fixture?mode=memory&cache=shared".to_string();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url)
        .await?;
    pool.execute("create table if not exists users (id integer primary key, email text not null);")
        .await?;
    pool.execute(
        "create table if not exists organizations (id integer primary key, name text not null);",
    )
    .await?;
    pool.execute("insert into users (email) values ('first@example.com'), ('second@example.com');")
        .await?;

    let connection = ResolvedConnectionProfile {
        id: "conn-sqlite".into(),
        name: "Fixture SQLite".into(),
        engine: "sqlite".into(),
        family: "sql".into(),
        host: "file:universality-fixture".into(),
        port: None,
        database: Some("file:universality-fixture".into()),
        username: None,
        password: None,
        connection_string: Some(sqlite_url),
        read_only: false,
    };

    let test_result = adapters::test_connection(&connection, Vec::new()).await?;
    assert!(test_result.ok);

    let explorer = adapters::list_explorer_nodes(
        &connection,
        &ExplorerRequest {
            connection_id: connection.id.clone(),
            environment_id: "env-dev".into(),
            limit: Some(20),
            scope: None,
        },
    )
    .await?;
    assert!(!explorer.nodes.is_empty());

    let limited_explorer = adapters::list_explorer_nodes(
        &connection,
        &ExplorerRequest {
            connection_id: connection.id.clone(),
            environment_id: "env-dev".into(),
            limit: Some(1),
            scope: None,
        },
    )
    .await?;
    assert_eq!(limited_explorer.nodes.len(), 1);

    let result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-dev",
            "sql",
            "select email from users order by id;",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(result.engine, "sqlite");
    assert!(!result.payloads.is_empty());
    pool.close().await;
    Ok(())
}

#[tokio::test]
async fn mongodb_adapter_fixture_roundtrip() -> Result<(), CommandError> {
    if !fixtures_enabled() {
        return Ok(());
    }

    let connection = ResolvedConnectionProfile {
        id: "conn-mongodb".into(),
        name: "Fixture MongoDB".into(),
        engine: "mongodb".into(),
        family: "document".into(),
        host: env_or("UNIVERSALITY_MONGODB_HOST", "127.0.0.1"),
        port: Some(
            env_or("UNIVERSALITY_MONGODB_PORT", "27018")
                .parse()
                .unwrap_or(27018),
        ),
        database: Some(env_or("UNIVERSALITY_MONGODB_DB", "catalog")),
        username: Some(env_or("UNIVERSALITY_MONGODB_USER", "universality")),
        password: Some(env_or("UNIVERSALITY_MONGODB_PASSWORD", "universality")),
        connection_string: None,
        read_only: false,
    };

    let test_result = adapters::test_connection(&connection, Vec::new()).await?;
    assert!(test_result.ok);

    let result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-dev",
            "mongodb",
            "{\n  \"collection\": \"products\",\n  \"filter\": {},\n  \"limit\": 10\n}",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(result.engine, "mongodb");
    assert!(!result.payloads.is_empty());
    Ok(())
}

#[tokio::test]
async fn redis_adapter_fixture_roundtrip() -> Result<(), CommandError> {
    if !fixtures_enabled() {
        return Ok(());
    }

    let connection = ResolvedConnectionProfile {
        id: "conn-redis".into(),
        name: "Fixture Redis".into(),
        engine: "redis".into(),
        family: "keyvalue".into(),
        host: env_or("UNIVERSALITY_REDIS_HOST", "127.0.0.1"),
        port: Some(
            env_or("UNIVERSALITY_REDIS_PORT", "6380")
                .parse()
                .unwrap_or(6380),
        ),
        database: Some("0".into()),
        username: None,
        password: None,
        connection_string: None,
        read_only: false,
    };

    let client = redis::Client::open(format!(
        "redis://{}:{}/{}",
        connection.host,
        connection.port.unwrap_or(6380),
        connection.database.clone().unwrap_or_else(|| "0".into())
    ))?;
    let mut redis = client.get_multiplexed_async_connection().await?;
    let _: () = redis::cmd("HSET")
        .arg("session:9f2d7e1a")
        .arg("userId")
        .arg("a1b2c3")
        .arg("region")
        .arg("eu-west-1")
        .query_async(&mut redis)
        .await?;
    let _: () = redis::cmd("EXPIRE")
        .arg("session:9f2d7e1a")
        .arg(1800)
        .query_async(&mut redis)
        .await?;

    let test_result = adapters::test_connection(&connection, Vec::new()).await?;
    assert!(test_result.ok);

    let result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-prod",
            "redis",
            "HGETALL session:9f2d7e1a",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(result.engine, "redis");
    assert!(!result.payloads.is_empty());
    Ok(())
}
