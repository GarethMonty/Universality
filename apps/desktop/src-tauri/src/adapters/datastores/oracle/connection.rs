use serde_json::{json, Value};

use super::super::super::*;

pub(super) async fn test_oracle_connection(
    connection: &ResolvedConnectionProfile,
) -> Result<ConnectionTestResult, CommandError> {
    let started = Instant::now();
    Ok(ConnectionTestResult {
        ok: true,
        engine: connection.engine.clone(),
        message: format!(
            "Oracle adapter accepted {} as a SQL/PLSQL contract profile; native OCI execution is isolated for the Oracle driver pass.",
            connection.name
        ),
        warnings: vec![
            "Oracle live execution requires Oracle client/runtime prerequisites or a thin driver path; this adapter currently builds guarded SQL/PLSQL request, metadata, and diagnostics payloads."
                .into(),
            "Dictionary views and DBMS_XPLAN/profile access depend on user grants; unavailable actions should remain permission-aware."
                .into(),
        ],
        resolved_host: connection.host.clone(),
        resolved_database: Some(oracle_service_name(connection)),
        duration_ms: Some(duration_ms(started)),
    })
}

pub(super) fn oracle_service_name(connection: &ResolvedConnectionProfile) -> String {
    connection
        .database
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("ORCLPDB1")
        .to_string()
}

pub(super) fn oracle_connect_descriptor(connection: &ResolvedConnectionProfile) -> String {
    if let Some(connection_string) = connection.connection_string.as_deref() {
        return connection_string.to_string();
    }

    let host = if connection.host.trim().is_empty() {
        "127.0.0.1"
    } else {
        connection.host.trim()
    };
    format!(
        "{host}:{}/{}",
        connection.port.unwrap_or(1521),
        oracle_service_name(connection)
    )
}

pub(super) fn oracle_request_payload(
    connection: &ResolvedConnectionProfile,
    statement: &str,
    row_limit: u32,
    explain: bool,
) -> Value {
    json!({
        "driver": "oracle-oci-or-thin",
        "connectDescriptor": oracle_connect_descriptor(connection),
        "schema": connection.username.clone().unwrap_or_else(|| "CURRENT_SCHEMA".into()),
        "statement": if explain {
            format!("EXPLAIN PLAN FOR {}", strip_sql_semicolon(statement))
        } else {
            statement.to_string()
        },
        "rowLimit": row_limit,
        "guardrails": {
            "mutationPreviewOnly": true,
            "dictionaryViewPermissionsRequired": true
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{oracle_connect_descriptor, oracle_request_payload, oracle_service_name};
    use crate::domain::models::ResolvedConnectionProfile;

    fn connection() -> ResolvedConnectionProfile {
        ResolvedConnectionProfile {
            id: "conn-oracle".into(),
            name: "Oracle".into(),
            engine: "oracle".into(),
            family: "sql".into(),
            host: "dbhost".into(),
            port: None,
            database: Some("FREEPDB1".into()),
            username: Some("APP".into()),
            password: None,
            connection_string: None,
            read_only: true,
        }
    }

    #[test]
    fn oracle_descriptor_uses_default_port_and_service() {
        assert_eq!(oracle_service_name(&connection()), "FREEPDB1");
        assert_eq!(
            oracle_connect_descriptor(&connection()),
            "dbhost:1521/FREEPDB1"
        );
    }

    #[test]
    fn oracle_request_payload_wraps_explain_plan() {
        let payload = oracle_request_payload(&connection(), "select * from dual", 25, true);

        assert_eq!(payload["schema"], "APP");
        assert_eq!(payload["rowLimit"], 25);
        assert_eq!(payload["statement"], "EXPLAIN PLAN FOR select * from dual");
    }
}
