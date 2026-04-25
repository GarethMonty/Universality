use super::super::super::*;

pub(crate) fn postgres_dsn(connection: &ResolvedConnectionProfile) -> String {
    connection.connection_string.clone().unwrap_or_else(|| {
        let default_port = if connection.engine == "cockroachdb" {
            26257
        } else {
            5432
        };
        let default_database = if connection.engine == "cockroachdb" {
            "defaultdb"
        } else {
            "postgres"
        };
        format!(
            "postgres://{}:{}@{}:{}/{}",
            connection
                .username
                .clone()
                .unwrap_or_else(|| "postgres".into()),
            connection.password.clone().unwrap_or_default(),
            connection.host,
            connection.port.unwrap_or(default_port),
            connection
                .database
                .clone()
                .unwrap_or_else(|| default_database.into())
        )
    })
}
