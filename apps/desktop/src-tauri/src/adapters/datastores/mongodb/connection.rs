use mongodb::Client as MongoClient;

use super::super::super::*;

pub(super) async fn mongodb_client(
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
