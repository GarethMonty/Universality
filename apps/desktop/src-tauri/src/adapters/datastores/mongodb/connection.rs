use std::time::Duration;

use mongodb::{options::ClientOptions, Client as MongoClient};

use super::super::super::*;

pub(super) async fn mongodb_client(
    connection: &ResolvedConnectionProfile,
) -> Result<MongoClient, CommandError> {
    let uri = mongodb_uri(connection);

    let mut options = ClientOptions::parse(uri).await?;
    options.server_selection_timeout = Some(Duration::from_secs(5));
    options.connect_timeout = Some(Duration::from_secs(5));

    Ok(MongoClient::with_options(options)?)
}

pub(super) async fn test_mongodb_connection(
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

fn mongodb_uri(connection: &ResolvedConnectionProfile) -> String {
    connection.connection_string.clone().unwrap_or_else(|| {
        let has_credentials = connection.username.is_some();
        let credentials = match (&connection.username, &connection.password) {
            (Some(username), Some(password)) => format!("{username}:{password}@"),
            (Some(username), None) => format!("{username}@"),
            _ => String::new(),
        };

        let database = connection
            .database
            .clone()
            .unwrap_or_else(|| "admin".into());
        let auth_source = if has_credentials && database != "admin" {
            "?authSource=admin"
        } else {
            ""
        };

        format!(
            "mongodb://{}{host}:{port}/{database}{auth_source}",
            credentials,
            host = connection.host,
            port = connection.port.unwrap_or(27017)
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mongodb_uri_uses_admin_auth_source_for_database_connections() {
        let connection = resolved_connection(Some("catalog"));

        assert_eq!(
            mongodb_uri(&connection),
            "mongodb://datanaut:datanaut@localhost:27018/catalog?authSource=admin"
        );
    }

    #[test]
    fn mongodb_uri_does_not_append_auth_source_to_connection_strings() {
        let mut connection = resolved_connection(Some("catalog"));
        connection.connection_string =
            Some("mongodb://user:secret@localhost:27018/catalog?authSource=app".into());

        assert_eq!(
            mongodb_uri(&connection),
            "mongodb://user:secret@localhost:27018/catalog?authSource=app"
        );
    }

    #[test]
    fn mongodb_uri_uses_admin_database_without_extra_auth_source() {
        let connection = resolved_connection(Some("admin"));

        assert_eq!(
            mongodb_uri(&connection),
            "mongodb://datanaut:datanaut@localhost:27018/admin"
        );
    }

    fn resolved_connection(database: Option<&str>) -> ResolvedConnectionProfile {
        ResolvedConnectionProfile {
            id: "conn-mongo".into(),
            name: "Fixture MongoDB".into(),
            engine: "mongodb".into(),
            family: "document".into(),
            host: "localhost".into(),
            port: Some(27018),
            database: database.map(str::to_string),
            username: Some("datanaut".into()),
            password: Some("datanaut".into()),
            connection_string: None,
            read_only: false,
        }
    }
}
