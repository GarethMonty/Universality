use std::{collections::BTreeMap, time::Instant};

use async_trait::async_trait;
use futures_util::TryStreamExt;
use mongodb::{
    bson::{self, doc, Document},
    Client as MongoClient,
};
use redis::AsyncCommands;
use serde_json::{json, Value};
use sqlx::{Column, Row, TypeInfo};
use tiberius::{AuthMethod, Client as SqlServerClient, ColumnData, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::{
    app::runtime::{generate_id, timestamp_now},
    domain::{
        error::CommandError,
        models::{
            AdapterManifest, CancelExecutionRequest, CancelExecutionResult, ConnectionTestResult,
            ExecutionCapabilities, ExecutionRequest, ExecutionResultEnvelope,
            ExplorerInspectRequest, ExplorerInspectResponse, ExplorerNode, ExplorerRequest,
            ExplorerResponse, QueryExecutionNotice, ResolvedConnectionProfile,
        },
    },
};

#[async_trait]
pub trait DatastoreAdapter: Send + Sync {
    fn manifest(&self) -> AdapterManifest;
    fn execution_capabilities(&self) -> ExecutionCapabilities;
    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError>;
    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError>;
    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError>;
    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError>;
    async fn cancel(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError>;
}

struct PostgresAdapter;
struct SqlServerAdapter;
struct MysqlLikeAdapter {
    engine: &'static str,
}
struct SqliteAdapter;
struct MongoDbAdapter;
struct RedisAdapter;

pub fn manifests() -> Vec<AdapterManifest> {
    vec![
        PostgresAdapter.manifest(),
        SqlServerAdapter.manifest(),
        MysqlLikeAdapter { engine: "mysql" }.manifest(),
        MysqlLikeAdapter { engine: "mariadb" }.manifest(),
        SqliteAdapter.manifest(),
        MongoDbAdapter.manifest(),
        RedisAdapter.manifest(),
    ]
}

pub fn execution_capabilities(engine: &str) -> ExecutionCapabilities {
    match engine {
        "postgresql" => PostgresAdapter.execution_capabilities(),
        "sqlserver" => SqlServerAdapter.execution_capabilities(),
        "mysql" => MysqlLikeAdapter { engine: "mysql" }.execution_capabilities(),
        "mariadb" => MysqlLikeAdapter { engine: "mariadb" }.execution_capabilities(),
        "sqlite" => SqliteAdapter.execution_capabilities(),
        "mongodb" => MongoDbAdapter.execution_capabilities(),
        "redis" => RedisAdapter.execution_capabilities(),
        _ => ExecutionCapabilities {
            can_cancel: false,
            can_explain: false,
            supports_live_metadata: false,
            editor_language: "text".into(),
            default_row_limit: 200,
        },
    }
}

pub async fn test_connection(
    connection: &ResolvedConnectionProfile,
    warnings: Vec<String>,
) -> Result<ConnectionTestResult, CommandError> {
    let adapter = adapter_for_engine(&connection.engine)?;
    let mut result = adapter.test_connection(connection).await?;
    result.warnings.extend(warnings);
    Ok(result)
}

pub async fn list_explorer_nodes(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerRequest,
) -> Result<ExplorerResponse, CommandError> {
    adapter_for_engine(&connection.engine)?
        .list_explorer_nodes(connection, request)
        .await
}

pub async fn inspect_explorer_node(
    connection: &ResolvedConnectionProfile,
    request: &ExplorerInspectRequest,
) -> Result<ExplorerInspectResponse, CommandError> {
    adapter_for_engine(&connection.engine)?
        .inspect_explorer_node(connection, request)
        .await
}

pub async fn execute(
    connection: &ResolvedConnectionProfile,
    request: &ExecutionRequest,
    notices: Vec<QueryExecutionNotice>,
) -> Result<ExecutionResultEnvelope, CommandError> {
    adapter_for_engine(&connection.engine)?
        .execute(connection, request, notices)
        .await
}

pub async fn cancel(
    connection: &ResolvedConnectionProfile,
    request: &CancelExecutionRequest,
) -> Result<CancelExecutionResult, CommandError> {
    adapter_for_engine(&connection.engine)?
        .cancel(connection, request)
        .await
}

fn adapter_for_engine(engine: &str) -> Result<Box<dyn DatastoreAdapter>, CommandError> {
    match engine {
        "postgresql" => Ok(Box::new(PostgresAdapter)),
        "sqlserver" => Ok(Box::new(SqlServerAdapter)),
        "mysql" => Ok(Box::new(MysqlLikeAdapter { engine: "mysql" })),
        "mariadb" => Ok(Box::new(MysqlLikeAdapter { engine: "mariadb" })),
        "sqlite" => Ok(Box::new(SqliteAdapter)),
        "mongodb" => Ok(Box::new(MongoDbAdapter)),
        "redis" => Ok(Box::new(RedisAdapter)),
        _ => Err(CommandError::new(
            "adapter-unsupported",
            format!("No adapter is registered for engine `{engine}`."),
        )),
    }
}

fn manifest(
    id: &str,
    engine: &str,
    family: &str,
    label: &str,
    default_language: &str,
    capabilities: &[&str],
) -> AdapterManifest {
    AdapterManifest {
        id: id.into(),
        engine: engine.into(),
        family: family.into(),
        label: label.into(),
        maturity: "mvp".into(),
        capabilities: capabilities
            .iter()
            .map(|item| (*item).to_string())
            .collect(),
        default_language: default_language.into(),
    }
}

fn sql_capabilities(can_cancel: bool, can_explain: bool) -> ExecutionCapabilities {
    ExecutionCapabilities {
        can_cancel,
        can_explain,
        supports_live_metadata: true,
        editor_language: "sql".into(),
        default_row_limit: 200,
    }
}

fn payload_table(columns: Vec<String>, rows: Vec<Vec<String>>) -> Value {
    json!({
        "renderer": "table",
        "columns": columns,
        "rows": rows,
    })
}

fn payload_json(value: Value) -> Value {
    json!({
        "renderer": "json",
        "value": value,
    })
}

fn payload_raw(text: String) -> Value {
    json!({
        "renderer": "raw",
        "text": text,
    })
}

fn payload_document(documents: Value) -> Value {
    json!({
        "renderer": "document",
        "documents": documents,
    })
}

fn payload_keyvalue(
    entries: BTreeMap<String, String>,
    ttl: Option<String>,
    memory: Option<String>,
) -> Value {
    json!({
        "renderer": "keyvalue",
        "entries": entries,
        "ttl": ttl,
        "memoryUsage": memory,
    })
}

struct ResultEnvelopeInput<'a> {
    engine: &'a str,
    summary: String,
    default_renderer: &'a str,
    renderer_modes: Vec<&'a str>,
    payloads: Vec<Value>,
    notices: Vec<QueryExecutionNotice>,
    duration_ms: u64,
    row_limit: Option<u32>,
    truncated: bool,
    explain_payload: Option<Value>,
}

fn build_result(input: ResultEnvelopeInput<'_>) -> ExecutionResultEnvelope {
    ExecutionResultEnvelope {
        id: generate_id("result"),
        engine: input.engine.into(),
        summary: input.summary,
        default_renderer: input.default_renderer.into(),
        renderer_modes: input
            .renderer_modes
            .into_iter()
            .map(str::to_string)
            .collect(),
        payloads: input.payloads,
        notices: input.notices,
        executed_at: timestamp_now(),
        duration_ms: input.duration_ms,
        truncated: Some(input.truncated),
        row_limit: input.row_limit,
        continuation_token: None,
        explain_payload: input.explain_payload,
    }
}

fn sql_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn execute_mode(request: &ExecutionRequest) -> &str {
    request.mode.as_deref().unwrap_or("full")
}

fn selected_query(request: &ExecutionRequest) -> &str {
    if execute_mode(request) == "selection" {
        request
            .selected_text
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(request.query_text.as_str())
    } else {
        request.query_text.as_str()
    }
}

fn duration_ms(started: Instant) -> u64 {
    started.elapsed().as_millis() as u64
}

fn stringify_sql_value<T>(value: Option<T>) -> Option<String>
where
    T: ToString,
{
    value.map(|item| item.to_string())
}

fn stringify_pg_cell(row: &sqlx::postgres::PgRow, index: usize) -> String {
    stringify_sqlx_common(
        [
            row.try_get::<Option<String>, _>(index).ok().flatten(),
            row.try_get::<Option<bool>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i32>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<f64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<serde_json::Value>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<Vec<u8>>, _>(index)
                .ok()
                .flatten()
                .map(|item| format!("<{} bytes>", item.len())),
        ],
        format!("<{}>", row.columns()[index].type_info().name()),
    )
}

fn stringify_mysql_cell(row: &sqlx::mysql::MySqlRow, index: usize) -> String {
    stringify_sqlx_common(
        [
            row.try_get::<Option<String>, _>(index).ok().flatten(),
            row.try_get::<Option<bool>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i32>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<f64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            None,
            row.try_get::<Option<Vec<u8>>, _>(index)
                .ok()
                .flatten()
                .map(|item| format!("<{} bytes>", item.len())),
        ],
        format!("<{}>", row.columns()[index].type_info().name()),
    )
}

fn stringify_sqlite_cell(row: &sqlx::sqlite::SqliteRow, index: usize) -> String {
    stringify_sqlx_common(
        [
            row.try_get::<Option<String>, _>(index).ok().flatten(),
            row.try_get::<Option<bool>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<i32>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<f64>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            None,
            row.try_get::<Option<Vec<u8>>, _>(index)
                .ok()
                .flatten()
                .map(|item| format!("<{} bytes>", item.len())),
        ],
        format!("<{}>", row.columns()[index].type_info().name()),
    )
}

fn stringify_sqlx_common(candidates: [Option<String>; 7], fallback: String) -> String {
    candidates.into_iter().flatten().next().unwrap_or(fallback)
}

fn stringify_tiberius_cell(data: &ColumnData<'_>) -> String {
    match data {
        ColumnData::Bit(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::U8(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::I16(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::I32(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::I64(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::F32(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::F64(value) => stringify_sql_value(*value).unwrap_or_else(|| "null".into()),
        ColumnData::String(value) => value
            .as_ref()
            .map(|item| item.to_string())
            .unwrap_or_else(|| "null".into()),
        ColumnData::Guid(value) => value
            .as_ref()
            .map(|item| item.to_string())
            .unwrap_or_else(|| "null".into()),
        ColumnData::Binary(value) => value
            .as_ref()
            .map(|item| format!("<{} bytes>", item.len()))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Numeric(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Xml(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::DateTime(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::SmallDateTime(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Time(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::Date(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::DateTime2(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
        ColumnData::DateTimeOffset(value) => value
            .as_ref()
            .map(|item| format!("{item:?}"))
            .unwrap_or_else(|| "null".into()),
    }
}

fn postgres_dsn(connection: &ResolvedConnectionProfile) -> String {
    connection.connection_string.clone().unwrap_or_else(|| {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            connection
                .username
                .clone()
                .unwrap_or_else(|| "postgres".into()),
            connection.password.clone().unwrap_or_default(),
            connection.host,
            connection.port.unwrap_or(5432),
            connection
                .database
                .clone()
                .unwrap_or_else(|| "postgres".into())
        )
    })
}

fn mysql_dsn(connection: &ResolvedConnectionProfile) -> String {
    connection.connection_string.clone().unwrap_or_else(|| {
        format!(
            "mysql://{}:{}@{}:{}/{}",
            connection.username.clone().unwrap_or_else(|| "root".into()),
            connection.password.clone().unwrap_or_default(),
            connection.host,
            connection.port.unwrap_or(3306),
            connection.database.clone().unwrap_or_default()
        )
    })
}

fn sqlite_dsn(connection: &ResolvedConnectionProfile) -> String {
    connection.connection_string.clone().unwrap_or_else(|| {
        let path = connection
            .database
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| connection.host.clone());

        if path.starts_with("sqlite:") {
            path
        } else if path.contains(':') || path.starts_with('\\') || path.starts_with('/') {
            format!("sqlite:///{}", path.replace('\\', "/"))
        } else {
            format!("sqlite://{path}")
        }
    })
}

async fn sqlserver_client(
    connection: &ResolvedConnectionProfile,
) -> Result<SqlServerClient<tokio_util::compat::Compat<TcpStream>>, CommandError> {
    let mut config = if let Some(connection_string) = &connection.connection_string {
        Config::from_ado_string(connection_string)?
    } else {
        let mut config = Config::new();
        config.host(connection.host.clone());
        config.port(connection.port.unwrap_or(1433));

        if let Some(database) = &connection.database {
            config.database(database);
        }

        if let Some(username) = &connection.username {
            config.authentication(AuthMethod::sql_server(
                username.clone(),
                connection.password.clone().unwrap_or_default(),
            ));
        }

        config
    };

    config.trust_cert();
    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    let client = SqlServerClient::connect(config, tcp.compat_write()).await?;
    Ok(client)
}

async fn mongodb_client(
    connection: &ResolvedConnectionProfile,
) -> Result<MongoClient, CommandError> {
    let uri = connection.connection_string.clone().unwrap_or_else(|| {
        let credentials = match (&connection.username, &connection.password) {
            (Some(username), Some(password)) => format!("{username}:{password}@"),
            (Some(username), None) => format!("{username}@"),
            _ => String::new(),
        };

        let database = connection
            .database
            .clone()
            .unwrap_or_else(|| "admin".into());
        format!(
            "mongodb://{}{host}:{port}/{database}",
            credentials,
            host = connection.host,
            port = connection.port.unwrap_or(27017)
        )
    });

    Ok(MongoClient::with_uri_str(uri).await?)
}

async fn redis_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<redis::aio::MultiplexedConnection, CommandError> {
    let uri = connection.connection_string.clone().unwrap_or_else(|| {
        let auth = match (&connection.username, &connection.password) {
            (Some(username), Some(password)) => format!("{username}:{password}@"),
            (_, Some(password)) => format!(":{password}@"),
            _ => String::new(),
        };
        let db = connection
            .database
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "0".into());

        format!(
            "redis://{}{host}:{port}/{db}",
            auth,
            host = connection.host,
            port = connection.port.unwrap_or(6379)
        )
    });

    let client = redis::Client::open(uri)?;
    Ok(client.get_multiplexed_async_connection().await?)
}

fn sql_history_notice(notices: Vec<QueryExecutionNotice>) -> Vec<QueryExecutionNotice> {
    notices
}

#[async_trait]
impl DatastoreAdapter for PostgresAdapter {
    fn manifest(&self) -> AdapterManifest {
        manifest(
            "adapter-postgresql",
            "postgresql",
            "sql",
            "PostgreSQL adapter",
            "sql",
            &[
                "supports_sql_editor",
                "supports_schema_browser",
                "supports_explain_plan",
                "supports_transactions",
                "supports_result_snapshots",
                "supports_streaming_results",
            ],
        )
    }

    fn execution_capabilities(&self) -> ExecutionCapabilities {
        sql_capabilities(false, true)
    }

    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError> {
        let started = Instant::now();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&postgres_dsn(connection))
            .await?;
        let _: i64 = sqlx::query_scalar("select 1").fetch_one(&pool).await?;
        pool.close().await;

        Ok(ConnectionTestResult {
            ok: true,
            engine: connection.engine.clone(),
            message: format!("Connection test succeeded for {}.", connection.name),
            warnings: Vec::new(),
            resolved_host: connection.host.clone(),
            resolved_database: connection.database.clone(),
            duration_ms: Some(duration_ms(started)),
        })
    }

    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&postgres_dsn(connection))
            .await?;
        let nodes = if let Some(scope) = &request.scope {
            if let Some(schema) = scope.strip_prefix("schema:") {
                let query = format!(
                    "select table_name, table_type from information_schema.tables where table_schema = '{}' order by table_name",
                    sql_literal(schema)
                );
                sqlx::query(&query)
                    .fetch_all(&pool)
                    .await?
                    .into_iter()
                    .map(|row| ExplorerNode {
                        id: format!("{schema}.{}", row.get::<String, _>("table_name")),
                        family: "sql".into(),
                        label: row.get::<String, _>("table_name"),
                        kind: row.get::<String, _>("table_type").to_lowercase(),
                        detail: "Columns, indexes, and row estimates".into(),
                        scope: Some(format!(
                            "table:{schema}.{}",
                            row.get::<String, _>("table_name")
                        )),
                        path: Some(vec![connection.name.clone(), schema.to_string()]),
                        query_template: Some(format!(
                            "select * from {schema}.{} limit 100;",
                            row.get::<String, _>("table_name")
                        )),
                        expandable: Some(true),
                    })
                    .collect()
            } else if let Some(table) = scope.strip_prefix("table:") {
                let (schema, table_name) = table.split_once('.').unwrap_or(("public", table));
                let query = format!(
                    "select column_name, data_type from information_schema.columns where table_schema = '{}' and table_name = '{}' order by ordinal_position",
                    sql_literal(schema),
                    sql_literal(table_name)
                );
                sqlx::query(&query)
                    .fetch_all(&pool)
                    .await?
                    .into_iter()
                    .map(|row| ExplorerNode {
                        id: format!("{table}:{}", row.get::<String, _>("column_name")),
                        family: "sql".into(),
                        label: row.get::<String, _>("column_name"),
                        kind: "column".into(),
                        detail: row.get::<String, _>("data_type"),
                        scope: None,
                        path: Some(vec![connection.name.clone(), table.to_string()]),
                        query_template: None,
                        expandable: Some(false),
                    })
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            sqlx::query(
                "select schema_name from information_schema.schemata where schema_name not in ('information_schema', 'pg_catalog') order by schema_name",
            )
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| {
                let schema = row.get::<String, _>("schema_name");
                ExplorerNode {
                    id: format!("schema-{schema}"),
                    family: "sql".into(),
                    label: schema.clone(),
                    kind: "schema".into(),
                    detail: "PostgreSQL schema".into(),
                    scope: Some(format!("schema:{schema}")),
                    path: Some(vec![connection.name.clone()]),
                    query_template: Some(format!(
                        "select table_name from information_schema.tables where table_schema = '{schema}' order by table_name;"
                    )),
                    expandable: Some(true),
                }
            })
            .collect()
        };
        pool.close().await;

        Ok(ExplorerResponse {
            connection_id: request.connection_id.clone(),
            environment_id: request.environment_id.clone(),
            scope: request.scope.clone(),
            summary: format!(
                "Loaded {} explorer node(s) for {}.",
                nodes.len(),
                connection.name
            ),
            capabilities: self.execution_capabilities(),
            nodes,
        })
    }

    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        Ok(ExplorerInspectResponse {
            node_id: request.node_id.clone(),
            summary: format!(
                "Inspection ready for {} on {}.",
                request.node_id, connection.name
            ),
            query_template: Some(if request.node_id.contains('.') {
                format!("select * from {} limit 100;", request.node_id)
            } else {
                "select * from public.accounts limit 100;".into()
            }),
            payload: Some(json!({
                "nodeId": request.node_id,
                "engine": connection.engine,
            })),
        })
    }

    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError> {
        let started = Instant::now();
        let statement = selected_query(request);
        let query = if execute_mode(request) == "explain" {
            format!("EXPLAIN {statement}")
        } else {
            statement.to_string()
        };
        let row_limit = request
            .row_limit
            .unwrap_or(self.execution_capabilities().default_row_limit);
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&postgres_dsn(connection))
            .await?;
        let rows = sqlx::query(&query).fetch_all(&pool).await?;
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| column.name().to_string())
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        let total_rows = rows.len();
        let tabular_rows = rows
            .iter()
            .take(row_limit as usize)
            .map(|row| {
                (0..row.columns().len())
                    .map(|index| stringify_pg_cell(row, index))
                    .collect()
            })
            .collect::<Vec<Vec<String>>>();
        pool.close().await;
        let table_payload = payload_table(columns.clone(), tabular_rows);
        let explain_payload = if execute_mode(request) == "explain" {
            let explain_text = if columns.is_empty() {
                "Explain plan returned no rows.".to_string()
            } else {
                rows.iter()
                    .flat_map(|row| {
                        (0..row.columns().len()).map(|index| stringify_pg_cell(row, index))
                    })
                    .collect::<Vec<String>>()
                    .join("\n")
            };
            Some(payload_raw(explain_text))
        } else {
            None
        };

        Ok(build_result(ResultEnvelopeInput {
            engine: &connection.engine,
            summary: format!("{total_rows} row(s) returned from {}.", connection.name),
            default_renderer: if execute_mode(request) == "explain" {
                "raw"
            } else {
                "table"
            },
            renderer_modes: if execute_mode(request) == "explain" {
                vec!["raw", "table", "json"]
            } else {
                vec!["table", "json", "raw"]
            },
            payloads: vec![
                if let Some(payload) = explain_payload.clone() {
                    payload
                } else {
                    table_payload.clone()
                },
                payload_json(json!({
                    "engine": connection.engine,
                    "rowCount": total_rows,
                    "rowLimit": row_limit,
                })),
                if execute_mode(request) == "explain" {
                    table_payload
                } else {
                    payload_raw(statement.to_string())
                },
            ],
            notices: sql_history_notice(notices),
            duration_ms: duration_ms(started),
            row_limit: Some(row_limit),
            truncated: total_rows > row_limit as usize,
            explain_payload,
        }))
    }

    async fn cancel(
        &self,
        _connection: &ResolvedConnectionProfile,
        request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        Ok(CancelExecutionResult {
            ok: false,
            supported: false,
            message: format!(
                "Cancellation for PostgreSQL execution {} is not supported until active session cancellation is implemented.",
                request.execution_id
            ),
        })
    }
}

#[async_trait]
impl DatastoreAdapter for SqlServerAdapter {
    fn manifest(&self) -> AdapterManifest {
        manifest(
            "adapter-sqlserver",
            "sqlserver",
            "sql",
            "SQL Server adapter",
            "sql",
            &[
                "supports_sql_editor",
                "supports_schema_browser",
                "supports_explain_plan",
                "supports_transactions",
                "supports_result_snapshots",
            ],
        )
    }

    fn execution_capabilities(&self) -> ExecutionCapabilities {
        sql_capabilities(false, true)
    }

    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError> {
        let started = Instant::now();
        let mut client = sqlserver_client(connection).await?;
        client
            .simple_query("SELECT 1")
            .await?
            .into_results()
            .await?;

        Ok(ConnectionTestResult {
            ok: true,
            engine: connection.engine.clone(),
            message: format!("Connection test succeeded for {}.", connection.name),
            warnings: Vec::new(),
            resolved_host: connection.host.clone(),
            resolved_database: connection.database.clone(),
            duration_ms: Some(duration_ms(started)),
        })
    }

    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        let mut client = sqlserver_client(connection).await?;
        let nodes = if let Some(scope) = &request.scope {
            if let Some(schema) = scope.strip_prefix("schema:") {
                let query = format!(
                    "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '{}' ORDER BY table_name",
                    sql_literal(schema)
                );
                client
                    .simple_query(query)
                    .await?
                    .into_first_result()
                    .await?
                    .into_iter()
                    .map(|row| {
                        let table_name = row
                            .get::<&str, _>("table_name")
                            .unwrap_or_default()
                            .to_string();

                        ExplorerNode {
                            id: format!("{schema}.{table_name}"),
                            family: "sql".into(),
                            label: table_name.clone(),
                            kind: row
                                .get::<&str, _>("table_type")
                                .unwrap_or("table")
                                .to_lowercase(),
                            detail: "Columns, indexes, and row estimates".into(),
                            scope: Some(format!("table:{schema}.{table_name}")),
                            path: Some(vec![connection.name.clone(), schema.to_string()]),
                            query_template: Some(format!(
                                "select top 100 * from {schema}.{table_name};"
                            )),
                            expandable: Some(true),
                        }
                    })
                    .collect()
            } else if let Some(table) = scope.strip_prefix("table:") {
                let (schema, table_name) = table.split_once('.').unwrap_or(("dbo", table));
                let query = format!(
                    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '{}' AND table_name = '{}' ORDER BY ordinal_position",
                    sql_literal(schema),
                    sql_literal(table_name)
                );
                client
                    .simple_query(query)
                    .await?
                    .into_first_result()
                    .await?
                    .into_iter()
                    .map(|row| ExplorerNode {
                        id: format!(
                            "{table}:{}",
                            row.get::<&str, _>("column_name").unwrap_or_default()
                        ),
                        family: "sql".into(),
                        label: row.get::<&str, _>("column_name").unwrap_or_default().into(),
                        kind: "column".into(),
                        detail: row.get::<&str, _>("data_type").unwrap_or_default().into(),
                        scope: None,
                        path: Some(vec![connection.name.clone(), table.to_string()]),
                        query_template: None,
                        expandable: Some(false),
                    })
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            client
                .simple_query("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name")
                .await?
                .into_first_result()
                .await?
                .into_iter()
                .map(|row| {
                    let schema = row
                        .get::<&str, _>("schema_name")
                        .unwrap_or_default()
                        .to_string();

                    ExplorerNode {
                        id: format!("schema-{schema}"),
                        family: "sql".into(),
                        label: schema.clone(),
                        kind: "schema".into(),
                        detail: "SQL Server schema".into(),
                        scope: Some(format!("schema:{schema}")),
                        path: Some(vec![connection.name.clone()]),
                        query_template: Some(format!(
                            "select table_name from information_schema.tables where table_schema = '{schema}' order by table_name;"
                        )),
                        expandable: Some(true),
                    }
                })
                .collect()
        };

        Ok(ExplorerResponse {
            connection_id: request.connection_id.clone(),
            environment_id: request.environment_id.clone(),
            scope: request.scope.clone(),
            summary: format!(
                "Loaded {} explorer node(s) for {}.",
                nodes.len(),
                connection.name
            ),
            capabilities: self.execution_capabilities(),
            nodes,
        })
    }

    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        Ok(ExplorerInspectResponse {
            node_id: request.node_id.clone(),
            summary: format!(
                "Inspection ready for {} on {}.",
                request.node_id, connection.name
            ),
            query_template: Some(if request.node_id.contains('.') {
                format!("select top 100 * from {};", request.node_id)
            } else {
                "select top 100 * from dbo.orders;".into()
            }),
            payload: Some(json!({
                "nodeId": request.node_id,
                "engine": connection.engine,
            })),
        })
    }

    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError> {
        let started = Instant::now();
        let statement = selected_query(request);
        let query = if execute_mode(request) == "explain" {
            format!("SET SHOWPLAN_TEXT ON; {statement}; SET SHOWPLAN_TEXT OFF;")
        } else {
            statement.to_string()
        };
        let row_limit = request
            .row_limit
            .unwrap_or(self.execution_capabilities().default_row_limit);
        let mut client = sqlserver_client(connection).await?;
        let results = client.simple_query(query).await?.into_results().await?;
        let first_result = results.into_iter().next().unwrap_or_default();
        let columns = first_result
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| column.name().to_string())
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        let total_rows = first_result.len();
        let tabular_rows = first_result
            .iter()
            .take(row_limit as usize)
            .map(|row| {
                row.cells()
                    .map(|(_, value)| stringify_tiberius_cell(value))
                    .collect()
            })
            .collect::<Vec<Vec<String>>>();

        let primary_payload = if execute_mode(request) == "explain" {
            payload_raw(
                tabular_rows
                    .iter()
                    .flat_map(|row| row.iter().cloned())
                    .collect::<Vec<String>>()
                    .join("\n"),
            )
        } else if columns.is_empty() {
            payload_raw("Statement executed successfully.".into())
        } else {
            payload_table(columns.clone(), tabular_rows)
        };
        let explain_payload = if execute_mode(request) == "explain" {
            Some(primary_payload.clone())
        } else {
            None
        };

        Ok(build_result(ResultEnvelopeInput {
            engine: &connection.engine,
            summary: format!("{total_rows} row(s) returned from {}.", connection.name),
            default_renderer: if execute_mode(request) == "explain" {
                "raw"
            } else {
                "table"
            },
            renderer_modes: if execute_mode(request) == "explain" {
                vec!["raw", "table", "json"]
            } else {
                vec!["table", "json", "raw"]
            },
            payloads: vec![
                primary_payload,
                payload_json(json!({
                    "engine": connection.engine,
                    "rowCount": total_rows,
                    "rowLimit": row_limit,
                })),
                payload_raw(statement.to_string()),
            ],
            notices,
            duration_ms: duration_ms(started),
            row_limit: Some(row_limit),
            truncated: total_rows > row_limit as usize,
            explain_payload,
        }))
    }

    async fn cancel(
        &self,
        _connection: &ResolvedConnectionProfile,
        request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        Ok(CancelExecutionResult {
            ok: false,
            supported: false,
            message: format!(
                "Cancellation for SQL Server execution {} is not supported until active session cancellation is implemented.",
                request.execution_id
            ),
        })
    }
}

#[async_trait]
impl DatastoreAdapter for MysqlLikeAdapter {
    fn manifest(&self) -> AdapterManifest {
        manifest(
            &format!("adapter-{}", self.engine),
            self.engine,
            "sql",
            if self.engine == "mariadb" {
                "MariaDB adapter"
            } else {
                "MySQL adapter"
            },
            "sql",
            &[
                "supports_sql_editor",
                "supports_schema_browser",
                "supports_transactions",
                "supports_result_snapshots",
            ],
        )
    }

    fn execution_capabilities(&self) -> ExecutionCapabilities {
        sql_capabilities(false, false)
    }

    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError> {
        let started = Instant::now();
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .connect(&mysql_dsn(connection))
            .await?;
        let _: i64 = sqlx::query_scalar("select 1").fetch_one(&pool).await?;
        pool.close().await;

        Ok(ConnectionTestResult {
            ok: true,
            engine: connection.engine.clone(),
            message: format!("Connection test succeeded for {}.", connection.name),
            warnings: Vec::new(),
            resolved_host: connection.host.clone(),
            resolved_database: connection.database.clone(),
            duration_ms: Some(duration_ms(started)),
        })
    }

    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .connect(&mysql_dsn(connection))
            .await?;
        let active_schema = request
            .scope
            .as_deref()
            .and_then(|scope| scope.strip_prefix("schema:"))
            .map(str::to_string)
            .or_else(|| connection.database.clone())
            .unwrap_or_else(|| "mysql".into());
        let nodes: Vec<ExplorerNode> = if request.scope.is_some() {
            let query = format!(
                "select table_name, table_type from information_schema.tables where table_schema = '{}' order by table_name",
                sql_literal(&active_schema)
            );
            sqlx::query(&query)
                .fetch_all(&pool)
                .await?
                .into_iter()
                .map(|row| {
                    let table_name = row.get::<String, _>("table_name");
                    ExplorerNode {
                        id: format!("{active_schema}.{table_name}"),
                        family: "sql".into(),
                        label: table_name.clone(),
                        kind: row.get::<String, _>("table_type").to_lowercase(),
                        detail: "Columns and row estimates".into(),
                        scope: Some(format!("table:{active_schema}.{table_name}")),
                        path: Some(vec![connection.name.clone(), active_schema.clone()]),
                        query_template: Some(format!("select * from `{table_name}` limit 100;")),
                        expandable: Some(true),
                    }
                })
                .collect()
        } else {
            vec![ExplorerNode {
                id: format!("schema-{active_schema}"),
                family: "sql".into(),
                label: active_schema.clone(),
                kind: "schema".into(),
                detail: format!("{} default schema", connection.engine),
                scope: Some(format!("schema:{active_schema}")),
                path: Some(vec![connection.name.clone()]),
                query_template: Some(format!(
                    "select table_name from information_schema.tables where table_schema = '{active_schema}' order by table_name;"
                )),
                expandable: Some(true),
            }]
        };
        pool.close().await;

        Ok(ExplorerResponse {
            connection_id: request.connection_id.clone(),
            environment_id: request.environment_id.clone(),
            scope: request.scope.clone(),
            summary: format!(
                "Loaded {} explorer node(s) for {}.",
                nodes.len(),
                connection.name
            ),
            capabilities: self.execution_capabilities(),
            nodes,
        })
    }

    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        Ok(ExplorerInspectResponse {
            node_id: request.node_id.clone(),
            summary: format!(
                "Inspection ready for {} on {}.",
                request.node_id, connection.name
            ),
            query_template: Some(
                request
                    .node_id
                    .split('.')
                    .next_back()
                    .map(|table| format!("select * from `{table}` limit 100;"))
                    .unwrap_or_else(|| "select 1;".into()),
            ),
            payload: Some(json!({
                "nodeId": request.node_id,
                "engine": connection.engine,
            })),
        })
    }

    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError> {
        let started = Instant::now();
        let statement = selected_query(request);
        let row_limit = request
            .row_limit
            .unwrap_or(self.execution_capabilities().default_row_limit);
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .connect(&mysql_dsn(connection))
            .await?;
        let rows = sqlx::query(statement).fetch_all(&pool).await?;
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| column.name().to_string())
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        let total_rows = rows.len();
        let tabular_rows = rows
            .iter()
            .take(row_limit as usize)
            .map(|row| {
                (0..row.columns().len())
                    .map(|index| stringify_mysql_cell(row, index))
                    .collect()
            })
            .collect::<Vec<Vec<String>>>();
        pool.close().await;

        Ok(build_result(ResultEnvelopeInput {
            engine: &connection.engine,
            summary: format!("{total_rows} row(s) returned from {}.", connection.name),
            default_renderer: "table",
            renderer_modes: vec!["table", "json", "raw"],
            payloads: vec![
                payload_table(columns, tabular_rows),
                payload_json(json!({
                    "engine": connection.engine,
                    "rowCount": total_rows,
                    "rowLimit": row_limit,
                })),
                payload_raw(statement.to_string()),
            ],
            notices,
            duration_ms: duration_ms(started),
            row_limit: Some(row_limit),
            truncated: total_rows > row_limit as usize,
            explain_payload: None,
        }))
    }

    async fn cancel(
        &self,
        _connection: &ResolvedConnectionProfile,
        _request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        Ok(CancelExecutionResult {
            ok: false,
            supported: false,
            message: format!(
                "Cancellation is not supported for {} in this milestone.",
                self.engine
            ),
        })
    }
}

#[async_trait]
impl DatastoreAdapter for SqliteAdapter {
    fn manifest(&self) -> AdapterManifest {
        manifest(
            "adapter-sqlite",
            "sqlite",
            "sql",
            "SQLite adapter",
            "sql",
            &[
                "supports_sql_editor",
                "supports_schema_browser",
                "supports_result_snapshots",
            ],
        )
    }

    fn execution_capabilities(&self) -> ExecutionCapabilities {
        sql_capabilities(false, false)
    }

    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError> {
        let started = Instant::now();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_dsn(connection))
            .await?;
        let _: i64 = sqlx::query_scalar("select 1").fetch_one(&pool).await?;
        pool.close().await;

        Ok(ConnectionTestResult {
            ok: true,
            engine: connection.engine.clone(),
            message: format!("Connection test succeeded for {}.", connection.name),
            warnings: Vec::new(),
            resolved_host: connection.host.clone(),
            resolved_database: connection.database.clone(),
            duration_ms: Some(duration_ms(started)),
        })
    }

    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_dsn(connection))
            .await?;
        let nodes = if let Some(scope) = &request.scope {
            if let Some(table) = scope.strip_prefix("table:") {
                let query = format!("pragma table_info('{}')", sql_literal(table));
                sqlx::query(&query)
                    .fetch_all(&pool)
                    .await?
                    .into_iter()
                    .map(|row| ExplorerNode {
                        id: format!("{table}:{}", row.get::<String, _>("name")),
                        family: "sql".into(),
                        label: row.get::<String, _>("name"),
                        kind: "column".into(),
                        detail: row.get::<String, _>("type"),
                        scope: None,
                        path: Some(vec![connection.name.clone(), table.to_string()]),
                        query_template: None,
                        expandable: Some(false),
                    })
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            sqlx::query(
                "select name, type from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%' order by name",
            )
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|row| {
                let name = row.get::<String, _>("name");
                ExplorerNode {
                    id: name.clone(),
                    family: "sql".into(),
                    label: name.clone(),
                    kind: row.get::<String, _>("type"),
                    detail: "SQLite object".into(),
                    scope: Some(format!("table:{name}")),
                    path: Some(vec![connection.name.clone()]),
                    query_template: Some(format!("select * from \"{name}\" limit 100;")),
                    expandable: Some(true),
                }
            })
            .collect()
        };
        pool.close().await;

        Ok(ExplorerResponse {
            connection_id: request.connection_id.clone(),
            environment_id: request.environment_id.clone(),
            scope: request.scope.clone(),
            summary: format!(
                "Loaded {} explorer node(s) for {}.",
                nodes.len(),
                connection.name
            ),
            capabilities: self.execution_capabilities(),
            nodes,
        })
    }

    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        Ok(ExplorerInspectResponse {
            node_id: request.node_id.clone(),
            summary: format!(
                "Inspection ready for {} on {}.",
                request.node_id, connection.name
            ),
            query_template: Some(format!("select * from \"{}\" limit 100;", request.node_id)),
            payload: Some(json!({
                "nodeId": request.node_id,
                "engine": connection.engine,
            })),
        })
    }

    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError> {
        let started = Instant::now();
        let statement = selected_query(request);
        let row_limit = request
            .row_limit
            .unwrap_or(self.execution_capabilities().default_row_limit);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_dsn(connection))
            .await?;
        let rows = sqlx::query(statement).fetch_all(&pool).await?;
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| column.name().to_string())
                    .collect()
            })
            .unwrap_or_else(Vec::new);
        let total_rows = rows.len();
        let tabular_rows = rows
            .iter()
            .take(row_limit as usize)
            .map(|row| {
                (0..row.columns().len())
                    .map(|index| stringify_sqlite_cell(row, index))
                    .collect()
            })
            .collect::<Vec<Vec<String>>>();
        pool.close().await;

        Ok(build_result(ResultEnvelopeInput {
            engine: &connection.engine,
            summary: format!("{total_rows} row(s) returned from {}.", connection.name),
            default_renderer: "table",
            renderer_modes: vec!["table", "json", "raw"],
            payloads: vec![
                payload_table(columns, tabular_rows),
                payload_json(json!({
                    "engine": connection.engine,
                    "rowCount": total_rows,
                    "rowLimit": row_limit,
                })),
                payload_raw(statement.to_string()),
            ],
            notices,
            duration_ms: duration_ms(started),
            row_limit: Some(row_limit),
            truncated: total_rows > row_limit as usize,
            explain_payload: None,
        }))
    }

    async fn cancel(
        &self,
        _connection: &ResolvedConnectionProfile,
        _request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        Ok(CancelExecutionResult {
            ok: false,
            supported: false,
            message: "Cancellation is not supported for sqlite in this milestone.".into(),
        })
    }
}

#[async_trait]
impl DatastoreAdapter for MongoDbAdapter {
    fn manifest(&self) -> AdapterManifest {
        manifest(
            "adapter-mongodb",
            "mongodb",
            "document",
            "MongoDB adapter",
            "mongodb",
            &["supports_document_view", "supports_result_snapshots"],
        )
    }

    fn execution_capabilities(&self) -> ExecutionCapabilities {
        ExecutionCapabilities {
            can_cancel: false,
            can_explain: false,
            supports_live_metadata: true,
            editor_language: "json".into(),
            default_row_limit: 100,
        }
    }

    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError> {
        let started = Instant::now();
        let client = mongodb_client(connection).await?;
        let _ = client.list_database_names().await?;

        Ok(ConnectionTestResult {
            ok: true,
            engine: connection.engine.clone(),
            message: format!("Connection test succeeded for {}.", connection.name),
            warnings: Vec::new(),
            resolved_host: connection.host.clone(),
            resolved_database: connection.database.clone(),
            duration_ms: Some(duration_ms(started)),
        })
    }

    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        let client = mongodb_client(connection).await?;
        let database_name = connection
            .database
            .clone()
            .unwrap_or_else(|| "admin".into());
        let database = client.database(&database_name);
        let nodes = if let Some(scope) = &request.scope {
            if let Some(collection_name) = scope.strip_prefix("collection:") {
                let collection = database.collection::<Document>(collection_name);
                let index_names = collection.list_index_names().await?;

                vec![
                    ExplorerNode {
                        id: format!("{collection_name}:indexes"),
                        family: "document".into(),
                        label: "Indexes".into(),
                        kind: "indexes".into(),
                        detail: format!("{} index(es)", index_names.len()),
                        scope: None,
                        path: Some(vec![connection.name.clone(), collection_name.to_string()]),
                        query_template: Some(format!(
                            "{{\n  \"collection\": \"{collection_name}\",\n  \"filter\": {{}},\n  \"limit\": 50\n}}"
                        )),
                        expandable: Some(false),
                    },
                    ExplorerNode {
                        id: format!("{collection_name}:sample"),
                        family: "document".into(),
                        label: "Sample documents".into(),
                        kind: "sample-documents".into(),
                        detail: "Quick preview of collection contents".into(),
                        scope: None,
                        path: Some(vec![connection.name.clone(), collection_name.to_string()]),
                        query_template: Some(format!(
                            "{{\n  \"collection\": \"{collection_name}\",\n  \"pipeline\": [\n    {{ \"$match\": {{}} }},\n    {{ \"$limit\": 20 }}\n  ]\n}}"
                        )),
                        expandable: Some(false),
                    },
                ]
            } else {
                Vec::new()
            }
        } else {
            database
                .list_collection_names()
                .await?
                .into_iter()
                .map(|collection_name| ExplorerNode {
                    id: collection_name.clone(),
                    family: "document".into(),
                    label: collection_name.clone(),
                    kind: "collection".into(),
                    detail: "Documents, indexes, and samples".into(),
                    scope: Some(format!("collection:{collection_name}")),
                    path: Some(vec![connection.name.clone()]),
                    query_template: Some(format!(
                        "{{\n  \"collection\": \"{collection_name}\",\n  \"filter\": {{}},\n  \"limit\": 50\n}}"
                    )),
                    expandable: Some(true),
                })
                .collect()
        };

        Ok(ExplorerResponse {
            connection_id: request.connection_id.clone(),
            environment_id: request.environment_id.clone(),
            scope: request.scope.clone(),
            summary: format!(
                "Loaded {} explorer node(s) for {}.",
                nodes.len(),
                connection.name
            ),
            capabilities: self.execution_capabilities(),
            nodes,
        })
    }

    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        let client = mongodb_client(connection).await?;
        let database_name = connection
            .database
            .clone()
            .unwrap_or_else(|| "admin".into());
        let database = client.database(&database_name);
        let collection_name = request
            .node_id
            .split(':')
            .next()
            .unwrap_or(request.node_id.as_str());
        let collection = database.collection::<Document>(collection_name);
        let sample_documents = collection
            .find(doc! {})
            .limit(3)
            .await?
            .try_collect::<Vec<Document>>()
            .await?;
        let index_names = collection.list_index_names().await?;

        Ok(ExplorerInspectResponse {
            node_id: request.node_id.clone(),
            summary: format!("Inspection ready for {} on {}.", request.node_id, connection.name),
            query_template: Some(format!(
                "{{\n  \"collection\": \"{collection_name}\",\n  \"filter\": {{}},\n  \"limit\": 50\n}}"
            )),
            payload: Some(json!({
                "collection": collection_name,
                "indexes": index_names,
                "sampleDocuments": sample_documents,
            })),
        })
    }

    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError> {
        let started = Instant::now();
        let client = mongodb_client(connection).await?;
        let database_name = connection
            .database
            .clone()
            .unwrap_or_else(|| "admin".into());
        let database = client.database(&database_name);
        let input = serde_json::from_str::<serde_json::Value>(selected_query(request))?;
        let collection_name = input
            .get("collection")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                CommandError::new(
                    "mongodb-query-shape",
                    "MongoDB queries must include a `collection` field in this milestone.",
                )
            })?;
        let collection = database.collection::<Document>(collection_name);
        let limit = i64::from(
            request
                .row_limit
                .unwrap_or(self.execution_capabilities().default_row_limit),
        );
        let documents = if let Some(pipeline) = input.get("pipeline").and_then(Value::as_array) {
            let pipeline = pipeline
                .iter()
                .map(bson::to_document)
                .collect::<Result<Vec<Document>, _>>()?;
            collection
                .aggregate(pipeline)
                .await?
                .try_collect::<Vec<Document>>()
                .await?
        } else {
            let filter = input.get("filter").cloned().unwrap_or_else(|| json!({}));
            let document = bson::to_document(&filter)?;
            collection
                .find(document)
                .limit(limit)
                .await?
                .try_collect::<Vec<Document>>()
                .await?
        };
        let row_limit = request
            .row_limit
            .unwrap_or(self.execution_capabilities().default_row_limit);
        let truncated = documents.len() > row_limit as usize;
        let documents_json = serde_json::to_value(
            documents
                .iter()
                .take(row_limit as usize)
                .collect::<Vec<&Document>>(),
        )?;

        Ok(build_result(ResultEnvelopeInput {
            engine: &connection.engine,
            summary: format!(
                "{} document(s) returned from {}.",
                documents.len(),
                connection.name
            ),
            default_renderer: "document",
            renderer_modes: vec!["document", "json", "table", "raw"],
            payloads: vec![
                payload_document(documents_json.clone()),
                payload_json(json!({
                    "engine": connection.engine,
                    "collection": collection_name,
                    "rowCount": documents.len(),
                    "rowLimit": row_limit,
                })),
                payload_table(
                    vec!["document".into()],
                    documents
                        .iter()
                        .take(row_limit as usize)
                        .map(|item| {
                            vec![serde_json::to_string(item).unwrap_or_else(|_| "{}".into())]
                        })
                        .collect(),
                ),
                payload_raw(selected_query(request).to_string()),
            ],
            notices,
            duration_ms: duration_ms(started),
            row_limit: Some(row_limit),
            truncated,
            explain_payload: None,
        }))
    }

    async fn cancel(
        &self,
        _connection: &ResolvedConnectionProfile,
        _request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        Ok(CancelExecutionResult {
            ok: false,
            supported: false,
            message: "Cancellation is not supported for mongodb in this milestone.".into(),
        })
    }
}

#[async_trait]
impl DatastoreAdapter for RedisAdapter {
    fn manifest(&self) -> AdapterManifest {
        manifest(
            "adapter-redis",
            "redis",
            "keyvalue",
            "Redis adapter",
            "redis",
            &[
                "supports_key_browser",
                "supports_ttl_management",
                "supports_result_snapshots",
            ],
        )
    }

    fn execution_capabilities(&self) -> ExecutionCapabilities {
        ExecutionCapabilities {
            can_cancel: false,
            can_explain: false,
            supports_live_metadata: true,
            editor_language: "plaintext".into(),
            default_row_limit: 100,
        }
    }

    async fn test_connection(
        &self,
        connection: &ResolvedConnectionProfile,
    ) -> Result<ConnectionTestResult, CommandError> {
        let started = Instant::now();
        let mut redis = redis_connection(connection).await?;
        let _: String = redis::cmd("PING").query_async(&mut redis).await?;

        Ok(ConnectionTestResult {
            ok: true,
            engine: connection.engine.clone(),
            message: format!("Connection test succeeded for {}.", connection.name),
            warnings: Vec::new(),
            resolved_host: connection.host.clone(),
            resolved_database: connection.database.clone(),
            duration_ms: Some(duration_ms(started)),
        })
    }

    async fn list_explorer_nodes(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerRequest,
    ) -> Result<ExplorerResponse, CommandError> {
        let mut redis = redis_connection(connection).await?;
        let limit = request.limit.unwrap_or(50);
        let pattern = request
            .scope
            .as_deref()
            .and_then(|scope| scope.strip_prefix("prefix:"))
            .map(str::to_string)
            .unwrap_or_else(|| "*".into());

        let (_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(0)
            .arg("MATCH")
            .arg(format!("{pattern}*"))
            .arg("COUNT")
            .arg(limit)
            .query_async(&mut redis)
            .await?;

        let nodes: Vec<ExplorerNode> = if request.scope.is_some() {
            keys.into_iter()
                .map(|key| ExplorerNode {
                    id: key.clone(),
                    family: "keyvalue".into(),
                    label: key.clone(),
                    kind: "key".into(),
                    detail: "Redis key".into(),
                    scope: None,
                    path: Some(vec![connection.name.clone(), pattern.clone()]),
                    query_template: Some(format!("HGETALL {key}")),
                    expandable: Some(false),
                })
                .collect()
        } else {
            let mut grouped = BTreeMap::new();
            for key in keys {
                let prefix = key.split(':').next().unwrap_or("root").to_string();
                *grouped.entry(prefix).or_insert(0_u32) += 1;
            }

            grouped
                .into_iter()
                .map(|(prefix, count)| ExplorerNode {
                    id: prefix.clone(),
                    family: "keyvalue".into(),
                    label: format!("{prefix}:*"),
                    kind: "prefix".into(),
                    detail: format!("{count} sampled key(s)"),
                    scope: Some(format!("prefix:{prefix}:")),
                    path: Some(vec![connection.name.clone()]),
                    query_template: Some(format!("SCAN 0 MATCH {prefix}:* COUNT 50")),
                    expandable: Some(true),
                })
                .collect()
        };

        Ok(ExplorerResponse {
            connection_id: request.connection_id.clone(),
            environment_id: request.environment_id.clone(),
            scope: request.scope.clone(),
            summary: format!(
                "Loaded {} explorer node(s) for {}.",
                nodes.len(),
                connection.name
            ),
            capabilities: self.execution_capabilities(),
            nodes,
        })
    }

    async fn inspect_explorer_node(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExplorerInspectRequest,
    ) -> Result<ExplorerInspectResponse, CommandError> {
        let mut redis = redis_connection(connection).await?;
        let key = request.node_id.clone();
        let key_type: String = redis::cmd("TYPE").arg(&key).query_async(&mut redis).await?;
        let ttl: i64 = redis::cmd("TTL")
            .arg(&key)
            .query_async(&mut redis)
            .await
            .unwrap_or(-1);
        let memory_usage: Option<u64> = redis::cmd("MEMORY")
            .arg("USAGE")
            .arg(&key)
            .query_async(&mut redis)
            .await
            .ok();
        let payload = if key_type == "hash" {
            let entries = redis::cmd("HGETALL")
                .arg(&key)
                .query_async::<Vec<String>>(&mut redis)
                .await
                .unwrap_or_default();
            json!({
                "key": key,
                "type": key_type,
                "ttlSeconds": ttl,
                "memoryUsage": memory_usage,
                "entries": entries,
            })
        } else {
            let value: Option<String> = redis.get(&key).await.ok();
            json!({
                "key": key,
                "type": key_type,
                "ttlSeconds": ttl,
                "memoryUsage": memory_usage,
                "value": value,
            })
        };

        Ok(ExplorerInspectResponse {
            node_id: request.node_id.clone(),
            summary: format!(
                "Inspection ready for {} on {}.",
                request.node_id, connection.name
            ),
            query_template: Some(format!(
                "TYPE {}\nTTL {}\nGET {}",
                request.node_id, request.node_id, request.node_id
            )),
            payload: Some(payload),
        })
    }

    async fn execute(
        &self,
        connection: &ResolvedConnectionProfile,
        request: &ExecutionRequest,
        notices: Vec<QueryExecutionNotice>,
    ) -> Result<ExecutionResultEnvelope, CommandError> {
        let started = Instant::now();
        let mut redis = redis_connection(connection).await?;
        let line = selected_query(request)
            .lines()
            .find(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                CommandError::new("redis-command-missing", "No Redis command was provided.")
            })?;
        let parts = line.split_whitespace().collect::<Vec<&str>>();

        if parts.is_empty() {
            return Err(CommandError::new(
                "redis-command-missing",
                "No Redis command was provided.",
            ));
        }

        let upper = parts[0].to_uppercase();
        let (payloads, summary) = match upper.as_str() {
            "PING" => {
                let result: String = redis::cmd("PING").query_async(&mut redis).await?;
                (
                    vec![
                        payload_raw(result.clone()),
                        payload_json(json!({ "response": result })),
                    ],
                    "Redis ping succeeded.".to_string(),
                )
            }
            "SCAN" => {
                let pattern = parts
                    .windows(2)
                    .find(|window| window[0].eq_ignore_ascii_case("MATCH"))
                    .map(|window| window[1])
                    .unwrap_or("*");
                let count = parts
                    .windows(2)
                    .find(|window| window[0].eq_ignore_ascii_case("COUNT"))
                    .and_then(|window| window[1].parse::<u32>().ok())
                    .unwrap_or(50);
                let (_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                    .arg(0)
                    .arg("MATCH")
                    .arg(pattern)
                    .arg("COUNT")
                    .arg(count)
                    .query_async(&mut redis)
                    .await?;

                (
                    vec![
                        payload_table(
                            vec!["key".into()],
                            keys.iter().map(|key| vec![key.clone()]).collect(),
                        ),
                        payload_json(json!({ "keys": keys })),
                        payload_raw(line.to_string()),
                    ],
                    format!("Redis scan returned {} key(s).", keys.len()),
                )
            }
            "HGETALL" if parts.len() > 1 => {
                let key = parts[1];
                let values = redis::cmd("HGETALL")
                    .arg(key)
                    .query_async::<Vec<String>>(&mut redis)
                    .await?;
                let ttl: i64 = redis::cmd("TTL").arg(key).query_async(&mut redis).await.unwrap_or(-1);
                let mut entries = BTreeMap::new();
                for chunk in values.chunks(2) {
                    if let [field, value] = chunk {
                        entries.insert((*field).to_string(), (*value).to_string());
                    }
                }

                (
                    vec![
                        payload_keyvalue(entries, Some(ttl.to_string()), None),
                        payload_json(json!({ "key": key, "fields": values })),
                        payload_raw(line.to_string()),
                    ],
                    format!("Redis hash {} loaded successfully.", key),
                )
            }
            "GET" if parts.len() > 1 => {
                let key = parts[1];
                let value: Option<String> = redis.get(key).await.ok();
                let mut entries = BTreeMap::new();
                entries.insert("value".into(), value.clone().unwrap_or_default());

                (
                    vec![
                        payload_keyvalue(entries, None, None),
                        payload_json(json!({ "key": key, "value": value })),
                        payload_raw(line.to_string()),
                    ],
                    format!("Redis value {} loaded successfully.", key),
                )
            }
            "TYPE" if parts.len() > 1 => {
                let key = parts[1];
                let key_type: String = redis::cmd("TYPE").arg(key).query_async(&mut redis).await?;
                let mut entries = BTreeMap::new();
                entries.insert("type".into(), key_type.clone());

                (
                    vec![
                        payload_keyvalue(entries, None, None),
                        payload_json(json!({ "key": key, "type": key_type })),
                        payload_raw(line.to_string()),
                    ],
                    format!("Redis type for {} resolved successfully.", key),
                )
            }
            "TTL" if parts.len() > 1 => {
                let key = parts[1];
                let ttl: i64 = redis::cmd("TTL").arg(key).query_async(&mut redis).await?;
                let mut entries = BTreeMap::new();
                entries.insert("ttl".into(), ttl.to_string());

                (
                    vec![
                        payload_keyvalue(entries, Some(ttl.to_string()), None),
                        payload_json(json!({ "key": key, "ttl": ttl })),
                        payload_raw(line.to_string()),
                    ],
                    format!("Redis TTL for {} resolved successfully.", key),
                )
            }
            _ => {
                return Err(CommandError::new(
                    "redis-command-unsupported",
                    "This milestone supports read-oriented Redis commands such as SCAN, HGETALL, GET, TYPE, TTL, and PING.",
                ))
            }
        };

        let default_renderer = payloads
            .first()
            .and_then(|payload| payload.get("renderer"))
            .and_then(Value::as_str)
            .unwrap_or("raw")
            .to_string();
        let renderer_modes_owned = payloads
            .iter()
            .filter_map(|payload| payload.get("renderer").and_then(Value::as_str))
            .map(str::to_string)
            .collect::<Vec<String>>();
        let renderer_modes = renderer_modes_owned
            .iter()
            .map(String::as_str)
            .collect::<Vec<&str>>();

        Ok(build_result(ResultEnvelopeInput {
            engine: &connection.engine,
            summary,
            default_renderer: &default_renderer,
            renderer_modes,
            payloads,
            notices,
            duration_ms: duration_ms(started),
            row_limit: Some(self.execution_capabilities().default_row_limit),
            truncated: false,
            explain_payload: None,
        }))
    }

    async fn cancel(
        &self,
        _connection: &ResolvedConnectionProfile,
        _request: &CancelExecutionRequest,
    ) -> Result<CancelExecutionResult, CommandError> {
        Ok(CancelExecutionResult {
            ok: false,
            supported: false,
            message: "Cancellation is not supported for redis in this milestone.".into(),
        })
    }
}
