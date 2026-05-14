use serde_json::{json, Value};

use super::super::super::*;
use super::connection::redis_connection;

pub(crate) async fn execute_redis_data_edit(
    connection: &ResolvedConnectionProfile,
    experience: &DatastoreExperienceManifest,
    request: &DataEditExecutionRequest,
) -> Result<DataEditExecutionResponse, CommandError> {
    let plan_request = DataEditPlanRequest {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        edit_kind: request.edit_kind.clone(),
        target: request.target.clone(),
        changes: request.changes.clone(),
    };
    let plan = default_data_edit_plan(connection, experience, &plan_request);
    let mut warnings = plan.plan.warnings.clone();
    let mut messages = Vec::new();

    if connection.read_only {
        warnings.push(
            "Live key edit execution was blocked because this connection is read-only.".into(),
        );
        return Ok(data_edit_response(
            request, plan, false, messages, warnings, None,
        ));
    }

    if let Some(expected) = plan.plan.confirmation_text.as_deref() {
        if request.confirmation_text.as_deref() != Some(expected) {
            warnings.push(format!("Type `{expected}` before executing this key edit."));
            return Ok(data_edit_response(
                request, plan, false, messages, warnings, None,
            ));
        }
    }

    if plan.execution_support != "live" {
        messages.push(
            "Generated a safe key-edit plan. Live execution is not enabled for this adapter."
                .into(),
        );
        return Ok(data_edit_response(
            request, plan, false, messages, warnings, None,
        ));
    }

    let Some(key) = request
        .target
        .key
        .as_deref()
        .filter(|value| !value.is_empty())
    else {
        warnings.push("Key edits need a single concrete key.".into());
        return Ok(data_edit_response(
            request, plan, false, messages, warnings, None,
        ));
    };
    let mut redis = redis_connection(connection).await?;
    let metadata = match request.edit_kind.as_str() {
        "set-key-value" => {
            let Some(value) = request
                .changes
                .first()
                .and_then(|change| change.value.as_ref())
            else {
                warnings.push("SET key edits require a value.".into());
                return Ok(data_edit_response(
                    request, plan, false, messages, warnings, None,
                ));
            };
            let value = redis_value(value);
            let response: String = redis::cmd("SET")
                .arg(key)
                .arg(&value)
                .query_async(&mut redis)
                .await?;
            messages.push(format!("Key `{key}` was set successfully."));
            json!({ "command": "SET", "key": key, "response": response })
        }
        "set-ttl" => {
            let Some(seconds) = ttl_seconds(request) else {
                warnings.push("TTL edits require a positive number of seconds.".into());
                return Ok(data_edit_response(
                    request, plan, false, messages, warnings, None,
                ));
            };
            let applied: bool = redis::cmd("EXPIRE")
                .arg(key)
                .arg(seconds)
                .query_async(&mut redis)
                .await?;

            if applied {
                messages.push(format!("TTL for `{key}` was set to {seconds} second(s)."));
            } else {
                warnings.push(format!(
                    "Redis did not set a TTL for `{key}` because the key does not exist."
                ));
            }

            json!({ "command": "EXPIRE", "key": key, "seconds": seconds, "applied": applied })
        }
        "delete-key" => {
            let deleted: i64 = redis::cmd("DEL").arg(key).query_async(&mut redis).await?;

            if deleted > 0 {
                messages.push(format!("Key `{key}` was deleted."));
            } else {
                warnings.push(format!(
                    "Key `{key}` did not exist when delete was requested."
                ));
            }

            json!({ "command": "DEL", "key": key, "deleted": deleted })
        }
        other => {
            return Err(CommandError::new(
                "keyvalue-edit-unsupported",
                format!("Key edit `{other}` is not supported."),
            ));
        }
    };

    Ok(data_edit_response(
        request,
        plan,
        true,
        messages,
        warnings,
        Some(metadata),
    ))
}

fn data_edit_response(
    request: &DataEditExecutionRequest,
    plan: DataEditPlanResponse,
    executed: bool,
    messages: Vec<String>,
    warnings: Vec<String>,
    metadata: Option<Value>,
) -> DataEditExecutionResponse {
    DataEditExecutionResponse {
        connection_id: request.connection_id.clone(),
        environment_id: request.environment_id.clone(),
        edit_kind: request.edit_kind.clone(),
        execution_support: plan.execution_support,
        executed,
        plan: plan.plan,
        messages,
        warnings,
        result: None,
        metadata,
    }
}

fn ttl_seconds(request: &DataEditExecutionRequest) -> Option<i64> {
    let value = request.changes.first()?.value.as_ref()?;
    let seconds = value
        .as_i64()
        .or_else(|| value.as_str().and_then(|value| value.parse::<i64>().ok()))?;
    (seconds > 0).then_some(seconds)
}

fn redis_value(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::models::DataEditTarget;

    use super::*;

    fn request(
        edit_kind: &str,
        key: Option<&str>,
        value: Option<Value>,
    ) -> DataEditExecutionRequest {
        DataEditExecutionRequest {
            connection_id: "conn-redis".into(),
            environment_id: "env-dev".into(),
            edit_kind: edit_kind.into(),
            target: DataEditTarget {
                object_kind: "key".into(),
                key: key.map(str::to_string),
                ..Default::default()
            },
            changes: value
                .map(|value| {
                    vec![DataEditChange {
                        value: Some(value),
                        ..Default::default()
                    }]
                })
                .unwrap_or_default(),
            confirmation_text: None,
        }
    }

    #[test]
    fn ttl_seconds_accepts_positive_string_or_number_values() {
        assert_eq!(
            ttl_seconds(&request("set-ttl", Some("session:1"), Some(json!(60)))),
            Some(60)
        );
        assert_eq!(
            ttl_seconds(&request("set-ttl", Some("session:1"), Some(json!("120")))),
            Some(120)
        );
        assert_eq!(
            ttl_seconds(&request("set-ttl", Some("session:1"), Some(json!(0)))),
            None
        );
        assert_eq!(
            ttl_seconds(&request("set-ttl", Some("session:1"), Some(json!("soon")))),
            None
        );
    }

    #[test]
    fn redis_value_preserves_strings_and_serializes_structured_values() {
        assert_eq!(redis_value(&json!("active")), "active");
        assert_eq!(
            redis_value(&json!({"enabled": true})),
            r#"{"enabled":true}"#
        );
    }
}
