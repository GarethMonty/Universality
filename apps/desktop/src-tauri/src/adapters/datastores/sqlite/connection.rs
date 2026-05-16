use std::{path::PathBuf, str::FromStr};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Column, Row, SqlitePool, TypeInfo,
};

use super::super::super::*;

pub(super) fn stringify_sqlite_cell(row: &sqlx::sqlite::SqliteRow, index: usize) -> String {
    stringify_sqlx_common(
        [
            row.try_get::<Option<String>, _>(index).ok().flatten(),
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
            row.try_get::<Option<bool>, _>(index)
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

pub(super) async fn sqlite_pool(
    connection: &ResolvedConnectionProfile,
) -> Result<SqlitePool, CommandError> {
    let options = sqlite_connect_options(connection)?;

    Ok(SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?)
}

fn sqlite_connect_options(
    connection: &ResolvedConnectionProfile,
) -> Result<SqliteConnectOptions, CommandError> {
    let raw = connection
        .connection_string
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(connection.database.as_deref())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(connection.host.as_str())
        .trim();

    if raw.is_empty() {
        return Err(CommandError::new(
            "sqlite-path-required",
            "Choose a SQLite database file before connecting.",
        ));
    }

    let options = if raw.starts_with("sqlite:") {
        SqliteConnectOptions::from_str(raw)?
    } else {
        SqliteConnectOptions::new().filename(PathBuf::from(raw))
    };

    Ok(options.create_if_missing(false))
}

pub(super) async fn test_sqlite_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    let pool = sqlite_pool(connection).await?;
    let _: i64 = sqlx::query_scalar("select 1").fetch_one(&pool).await?;
    let table_count: i64 = sqlx::query_scalar(
        "select count(*) from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%'",
    )
    .fetch_one(&pool)
    .await?;
    pool.close().await;
    let warnings = if table_count == 0 {
        vec![
            "SQLite opened this file, but no user tables or views were found. If `select 1` works but `accounts` does not, verify the Database file path or create the starter schema in this file."
                .into(),
        ]
    } else {
        Vec::new()
    };

    Ok(ConnectionTestResult {
        ok: true,
        engine: connection.engine.clone(),
        message: format!("Connection test succeeded for {}.", connection.name),
        warnings,
        resolved_host: connection.host.clone(),
        resolved_database: connection.database.clone(),
        duration_ms: Some(duration_ms(started)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_connection_fails_for_missing_local_file_instead_of_creating_empty_database() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "datapadplusplus-missing-{}.sqlite",
                std::process::id()
            ));
            let _ = std::fs::remove_file(&path);
            let connection = test_connection(path.to_string_lossy().as_ref());

            let error = match test_sqlite_connection(&connection).await {
                Ok(_) => panic!("missing file should not be created"),
                Err(error) => error,
            };

            assert_eq!(error.code, "sql-execution-error");
            assert!(!path.exists());
        });
    }

    #[test]
    fn sqlite_connection_warns_when_file_has_no_user_tables() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "datapadplusplus-empty-{}.sqlite",
                std::process::id()
            ));
            let _ = std::fs::remove_file(&path);
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(
                    SqliteConnectOptions::new()
                        .filename(&path)
                        .create_if_missing(true),
                )
                .await
                .expect("create empty sqlite file");
            pool.close().await;

            let result = test_sqlite_connection(&test_connection(path.to_string_lossy().as_ref()))
                .await
                .expect("connect to empty sqlite file");

            assert!(result
                .warnings
                .iter()
                .any(|warning| warning.contains("no user tables or views")));
            let _ = std::fs::remove_file(path);
        });
    }

    fn test_connection(path: &str) -> ResolvedConnectionProfile {
        ResolvedConnectionProfile {
            id: "conn-sqlite".into(),
            name: "SQLite".into(),
            engine: "sqlite".into(),
            family: "sql".into(),
            host: path.into(),
            port: None,
            database: Some(path.into()),
            username: None,
            password: None,
            connection_string: None,
            read_only: false,
        }
    }
}
