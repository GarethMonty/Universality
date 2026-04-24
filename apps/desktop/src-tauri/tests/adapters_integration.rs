use std::env;

use sqlx::Executor;
use universality_desktop_lib::{
    adapters,
    domain::{
        error::CommandError,
        models::{ExecutionRequest, ExplorerRequest, ResolvedConnectionProfile},
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
