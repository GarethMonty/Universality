use std::collections::BTreeSet;
use std::env;
use std::fs;

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

fn fixture_profile_enabled(profile: &str) -> bool {
    let value = env::var("UNIVERSALITY_FIXTURE_PROFILE").unwrap_or_default();
    value
        .split(',')
        .map(str::trim)
        .any(|item| item == "all" || item == profile)
}

fn env_or(key: &str, fallback: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| generated_fixture_env_value(key))
        .unwrap_or_else(|| fallback.to_string())
}

fn generated_fixture_env_value(key: &str) -> Option<String> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .find_map(|root| {
            let candidate = root.join("tests").join("fixtures").join(".generated.env");
            candidate.exists().then_some(candidate)
        })?;
    let contents = fs::read_to_string(path).ok()?;

    contents.lines().find_map(|line| {
        let (env_key, value) = line.split_once('=')?;
        (env_key.trim() == key).then(|| value.trim().to_string())
    })
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

    let scalar_result = adapters::execute(
        &connection,
        &execution_request(
            &connection.id,
            "env-dev",
            "sql",
            "select '2024-01-02 03:04:05+00'::timestamptz as ts_tz, timestamp '2024-01-02 03:04:05' as ts, date '2024-01-02' as date_value, time '03:04:05' as time_value, 123.45::numeric as amount, '00000000-0000-0000-0000-000000000001'::uuid as uuid_value, jsonb_build_object('ok', true) as json_value;",
        ),
        Vec::new(),
    )
    .await?;
    let row = scalar_result.payloads[0]
        .get("rows")
        .and_then(|value| value.as_array())
        .and_then(|rows| rows.first())
        .and_then(|value| value.as_array())
        .expect("scalar result row");
    let cells = row
        .iter()
        .map(|value| value.as_str().unwrap_or_default())
        .collect::<Vec<_>>();

    assert_eq!(cells[0], "2024-01-02T03:04:05+00:00");
    assert_eq!(cells[1], "2024-01-02 03:04:05");
    assert_eq!(cells[2], "2024-01-02");
    assert_eq!(cells[3], "03:04:05");
    assert_eq!(
        cells[4].trim_end_matches('0').trim_end_matches('.'),
        "123.45"
    );
    assert_eq!(cells[5], "00000000-0000-0000-0000-000000000001");
    assert_eq!(cells[6], "{\"ok\":true}");
    assert!(
        cells.iter().all(|cell| !cell.starts_with('<')),
        "known PostgreSQL scalar types should not render as placeholders: {cells:?}"
    );
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
    let document_payload = result
        .payloads
        .iter()
        .find(|payload| {
            payload.get("renderer").and_then(|value| value.as_str()) == Some("document")
        })
        .expect("document payload");
    let json_payload = result
        .payloads
        .iter()
        .find(|payload| payload.get("renderer").and_then(|value| value.as_str()) == Some("json"))
        .expect("json payload");
    let raw_payload = result
        .payloads
        .iter()
        .find(|payload| payload.get("renderer").and_then(|value| value.as_str()) == Some("raw"))
        .expect("raw payload");
    let documents = document_payload
        .get("documents")
        .and_then(|value| value.as_array())
        .expect("document rows");
    let json_documents = json_payload
        .get("value")
        .and_then(|value| value.as_array())
        .expect("json document rows");
    let raw_text = raw_payload
        .get("text")
        .and_then(|value| value.as_str())
        .expect("raw document text");

    assert!(!documents.is_empty());
    assert_eq!(json_documents.len(), documents.len());
    assert!(raw_text.contains("sku") || raw_text.contains("_id"));
    assert!(!raw_text.contains("\"collection\": \"products\""));
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

#[tokio::test]
async fn cache_profile_fixture_roundtrips() -> Result<(), CommandError> {
    if !fixtures_enabled() || !fixture_profile_enabled("cache") {
        return Ok(());
    }

    for (engine, port, query) in [
        ("valkey", 6381, "HGETALL session:9f2d7e1a"),
        ("memcached", 11212, "get cache:feature-flags"),
    ] {
        let connection = ResolvedConnectionProfile {
            id: format!("conn-{engine}"),
            name: format!("Fixture {engine}"),
            engine: engine.into(),
            family: "keyvalue".into(),
            host: "127.0.0.1".into(),
            port: Some(port),
            database: Some("0".into()),
            username: None,
            password: None,
            connection_string: None,
            read_only: false,
        };

        let test_result = adapters::test_connection(&connection, Vec::new()).await?;
        assert!(test_result.ok);

        let result = adapters::execute(
            &connection,
            &execution_request(&connection.id, "env-dev", "redis", query),
            Vec::new(),
        )
        .await?;
        assert_eq!(result.engine, engine);
        assert!(!result.payloads.is_empty());
    }

    Ok(())
}

#[tokio::test]
async fn sqlplus_profile_fixture_roundtrips() -> Result<(), CommandError> {
    if !fixtures_enabled() || !fixture_profile_enabled("sqlplus") {
        return Ok(());
    }

    let mariadb = ResolvedConnectionProfile {
        id: "conn-mariadb".into(),
        name: "Fixture MariaDB".into(),
        engine: "mariadb".into(),
        family: "sql".into(),
        host: "127.0.0.1".into(),
        port: Some(33061),
        database: Some("commerce".into()),
        username: Some("universality".into()),
        password: Some("universality".into()),
        connection_string: None,
        read_only: false,
    };
    let mariadb_result = adapters::execute(
        &mariadb,
        &execution_request(
            &mariadb.id,
            "env-dev",
            "sql",
            "select order_id, status from orders order by order_id limit 2;",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(mariadb_result.engine, "mariadb");
    assert!(!mariadb_result.payloads.is_empty());

    let timescale = ResolvedConnectionProfile {
        id: "conn-timescaledb".into(),
        name: "Fixture TimescaleDB".into(),
        engine: "timescaledb".into(),
        family: "timeseries".into(),
        host: "127.0.0.1".into(),
        port: Some(54330),
        database: Some("metrics".into()),
        username: Some("universality".into()),
        password: Some("universality".into()),
        connection_string: None,
        read_only: false,
    };
    let test_result = adapters::test_connection(&timescale, Vec::new()).await?;
    assert!(test_result.ok);
    let timescale_result = adapters::execute(
        &timescale,
        &execution_request(
            &timescale.id,
            "env-dev",
            "sql",
            "select region, orders from order_metrics order by time limit 2;",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(timescale_result.engine, "timescaledb");
    assert!(!timescale_result.payloads.is_empty());

    let cockroach = ResolvedConnectionProfile {
        id: "conn-cockroachdb".into(),
        name: "Fixture CockroachDB".into(),
        engine: "cockroachdb".into(),
        family: "sql".into(),
        host: "127.0.0.1".into(),
        port: Some(26257),
        database: Some("universality".into()),
        username: Some("root".into()),
        password: Some(String::new()),
        connection_string: Some("postgres://root@127.0.0.1:26257/universality".into()),
        read_only: false,
    };
    let cockroach_result = adapters::execute(
        &cockroach,
        &execution_request(
            &cockroach.id,
            "env-dev",
            "sql",
            "select transaction_id, status from transactions order by transaction_id limit 2;",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(cockroach_result.engine, "cockroachdb");
    assert!(!cockroach_result.payloads.is_empty());

    Ok(())
}

#[tokio::test]
async fn analytics_profile_fixture_roundtrips() -> Result<(), CommandError> {
    if !fixtures_enabled() || !fixture_profile_enabled("analytics") {
        return Ok(());
    }

    let clickhouse = ResolvedConnectionProfile {
        id: "conn-clickhouse".into(),
        name: "Fixture ClickHouse".into(),
        engine: "clickhouse".into(),
        family: "warehouse".into(),
        host: "127.0.0.1".into(),
        port: Some(8124),
        database: Some("analytics".into()),
        username: Some("universality".into()),
        password: Some("universality".into()),
        connection_string: None,
        read_only: false,
    };
    let clickhouse_result = adapters::execute(
        &clickhouse,
        &execution_request(
            &clickhouse.id,
            "env-dev",
            "clickhouse-sql",
            "select event_type from events order by event_time limit 2",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(clickhouse_result.engine, "clickhouse");
    assert!(!clickhouse_result.payloads.is_empty());

    let influxdb = ResolvedConnectionProfile {
        id: "conn-influxdb".into(),
        name: "Fixture InfluxDB".into(),
        engine: "influxdb".into(),
        family: "timeseries".into(),
        host: "127.0.0.1".into(),
        port: Some(8087),
        database: Some("metrics".into()),
        username: None,
        password: None,
        connection_string: None,
        read_only: false,
    };
    let influx_result = adapters::execute(
        &influxdb,
        &execution_request(
            &influxdb.id,
            "env-dev",
            "influxql",
            "select * from order_latency limit 2",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(influx_result.engine, "influxdb");
    assert!(!influx_result.payloads.is_empty());

    let prometheus = ResolvedConnectionProfile {
        id: "conn-prometheus".into(),
        name: "Fixture Prometheus".into(),
        engine: "prometheus".into(),
        family: "timeseries".into(),
        host: "127.0.0.1".into(),
        port: Some(9091),
        database: None,
        username: None,
        password: None,
        connection_string: None,
        read_only: false,
    };
    let prom_result = adapters::execute(
        &prometheus,
        &execution_request(&prometheus.id, "env-dev", "promql", "up"),
        Vec::new(),
    )
    .await?;
    assert_eq!(prom_result.engine, "prometheus");
    assert!(!prom_result.payloads.is_empty());

    Ok(())
}

#[tokio::test]
async fn search_profile_fixture_roundtrips() -> Result<(), CommandError> {
    if !fixtures_enabled() || !fixture_profile_enabled("search") {
        return Ok(());
    }

    for (engine, port) in [("opensearch", 9201), ("elasticsearch", 9202)] {
        let connection = ResolvedConnectionProfile {
            id: format!("conn-{engine}"),
            name: format!("Fixture {engine}"),
            engine: engine.into(),
            family: "search".into(),
            host: "127.0.0.1".into(),
            port: Some(port),
            database: None,
            username: None,
            password: None,
            connection_string: None,
            read_only: false,
        };
        let result = adapters::execute(
            &connection,
            &execution_request(
                &connection.id,
                "env-dev",
                "query-dsl",
                r#"{ "index": "orders", "body": { "query": { "match_all": {} } } }"#,
            ),
            Vec::new(),
        )
        .await?;
        assert_eq!(result.engine, engine);
        assert!(!result.payloads.is_empty());
    }

    Ok(())
}

#[tokio::test]
async fn graph_profile_fixture_roundtrips() -> Result<(), CommandError> {
    if !fixtures_enabled() || !fixture_profile_enabled("graph") {
        return Ok(());
    }

    let neo4j = ResolvedConnectionProfile {
        id: "conn-neo4j".into(),
        name: "Fixture Neo4j".into(),
        engine: "neo4j".into(),
        family: "graph".into(),
        host: "127.0.0.1".into(),
        port: Some(7475),
        database: Some("neo4j".into()),
        username: Some("neo4j".into()),
        password: Some("universality".into()),
        connection_string: None,
        read_only: false,
    };
    let neo4j_result = adapters::execute(
        &neo4j,
        &execution_request(
            &neo4j.id,
            "env-dev",
            "cypher",
            "MATCH (a:Account)-[:PLACED]->(o:Order) RETURN a, o LIMIT 2",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(neo4j_result.engine, "neo4j");
    assert!(!neo4j_result.payloads.is_empty());

    let arango = ResolvedConnectionProfile {
        id: "conn-arango".into(),
        name: "Fixture ArangoDB".into(),
        engine: "arango".into(),
        family: "graph".into(),
        host: "127.0.0.1".into(),
        port: Some(8529),
        database: Some("universality".into()),
        username: Some("root".into()),
        password: Some("universality".into()),
        connection_string: None,
        read_only: false,
    };
    let arango_result = adapters::execute(
        &arango,
        &execution_request(
            &arango.id,
            "env-dev",
            "aql",
            "FOR account IN accounts LIMIT 2 RETURN account",
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(arango_result.engine, "arango");
    assert!(!arango_result.payloads.is_empty());

    Ok(())
}

#[tokio::test]
async fn cloud_contract_profile_fixture_roundtrips() -> Result<(), CommandError> {
    if !fixtures_enabled() || !fixture_profile_enabled("cloud-contract") {
        return Ok(());
    }

    let dynamodb = ResolvedConnectionProfile {
        id: "conn-dynamodb".into(),
        name: "Fixture DynamoDB Local".into(),
        engine: "dynamodb".into(),
        family: "widecolumn".into(),
        host: "127.0.0.1".into(),
        port: Some(8001),
        database: None,
        username: None,
        password: None,
        connection_string: None,
        read_only: false,
    };
    let dynamodb_result = adapters::execute(
        &dynamodb,
        &execution_request(
            &dynamodb.id,
            "env-dev",
            "json",
            r#"{ "operation": "Scan", "TableName": "orders", "Limit": 5 }"#,
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(dynamodb_result.engine, "dynamodb");
    assert!(!dynamodb_result.payloads.is_empty());

    let bigquery = ResolvedConnectionProfile {
        id: "conn-bigquery".into(),
        name: "Fixture BigQuery Mock".into(),
        engine: "bigquery".into(),
        family: "warehouse".into(),
        host: "127.0.0.1".into(),
        port: Some(19050),
        database: Some("analytics".into()),
        username: Some("universality-project".into()),
        password: Some("fixture-token".into()),
        connection_string: Some("http://127.0.0.1:19050".into()),
        read_only: false,
    };
    let bigquery_result = adapters::execute(
        &bigquery,
        &execution_request(&bigquery.id, "env-dev", "google-sql", "select 1"),
        Vec::new(),
    )
    .await?;
    assert_eq!(bigquery_result.engine, "bigquery");
    assert!(bigquery_result.payloads.iter().any(|payload| payload
        .get("renderer")
        .and_then(|value| value.as_str())
        == Some("costEstimate")));

    let snowflake = ResolvedConnectionProfile {
        id: "conn-snowflake".into(),
        name: "Fixture Snowflake Mock".into(),
        engine: "snowflake".into(),
        family: "warehouse".into(),
        host: "127.0.0.1".into(),
        port: Some(19060),
        database: Some("UNIVERSALITY".into()),
        username: Some("PUBLIC".into()),
        password: Some("fixture-token".into()),
        connection_string: Some("http://127.0.0.1:19060".into()),
        read_only: false,
    };
    let snowflake_result = adapters::execute(
        &snowflake,
        &execution_request(&snowflake.id, "env-dev", "snowflake-sql", "select 1"),
        Vec::new(),
    )
    .await?;
    assert_eq!(snowflake_result.engine, "snowflake");
    assert!(!snowflake_result.payloads.is_empty());

    let cosmosdb = ResolvedConnectionProfile {
        id: "conn-cosmosdb".into(),
        name: "Fixture Cosmos DB Mock".into(),
        engine: "cosmosdb".into(),
        family: "document".into(),
        host: "127.0.0.1".into(),
        port: Some(19070),
        database: Some("universality".into()),
        username: None,
        password: Some("fixture-token".into()),
        connection_string: Some("http://127.0.0.1:19070".into()),
        read_only: false,
    };
    let cosmos_result = adapters::execute(
        &cosmosdb,
        &execution_request(
            &cosmosdb.id,
            "env-dev",
            "sql",
            r#"{ "operation": "QueryDocuments", "database": "universality", "container": "orders", "query": "SELECT * FROM c" }"#,
        ),
        Vec::new(),
    )
    .await?;
    assert_eq!(cosmos_result.engine, "cosmosdb");
    assert!(!cosmos_result.payloads.is_empty());

    let neptune = ResolvedConnectionProfile {
        id: "conn-neptune".into(),
        name: "Fixture Neptune Mock".into(),
        engine: "neptune".into(),
        family: "graph".into(),
        host: "127.0.0.1".into(),
        port: Some(19080),
        database: None,
        username: None,
        password: None,
        connection_string: Some("http://127.0.0.1:19080".into()),
        read_only: false,
    };
    let neptune_result = adapters::execute(
        &neptune,
        &execution_request(&neptune.id, "env-dev", "gremlin", "g.V().limit(1)"),
        Vec::new(),
    )
    .await?;
    assert_eq!(neptune_result.engine, "neptune");
    assert!(!neptune_result.payloads.is_empty());

    Ok(())
}
