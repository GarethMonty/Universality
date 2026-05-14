use crate::domain::{error::CommandError, models::ResolvedConnectionProfile};

pub(super) fn sql_dialect_hint_message(
    connection: &ResolvedConnectionProfile,
    query_text: &str,
) -> Option<String> {
    if connection.family != "sql" || connection.engine == "sqlserver" {
        return None;
    }

    if contains_sqlserver_bracket_identifier(query_text) {
        Some(
            "[ ] identifiers are SQL Server syntax; use schema.table or double-quoted identifiers for this engine."
                .to_string(),
        )
    } else {
        None
    }
}

fn contains_sqlserver_bracket_identifier(query_text: &str) -> bool {
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let bytes = query_text.as_bytes();
    let mut index = 0usize;

    while let Some(&byte) = bytes.get(index) {
        match byte {
            b'\'' if !in_double_quote => {
                in_single_quote = !in_single_quote;
            }
            b'"' if !in_single_quote => {
                in_double_quote = !in_double_quote;
            }
            b'[' if !in_single_quote && !in_double_quote => {
                if let Some(end) = bytes[index + 1..].iter().position(|value| *value == b']') {
                    let identifier = &query_text[index + 1..index + 1 + end];
                    if identifier.chars().any(|char| !char.is_whitespace()) {
                        return true;
                    }
                }
            }
            _ => {}
        }

        index += 1;
    }

    false
}

pub(super) fn enrich_sql_execution_error(
    connection: &ResolvedConnectionProfile,
    query_text: &str,
    error: CommandError,
) -> CommandError {
    let relation_hint = relation_does_not_exist_hint(connection, query_text, &error.message);
    let bracket_hint = sql_dialect_hint_message(connection, query_text);

    match (bracket_hint, relation_hint) {
        (None, None) => error,
        (Some(primary), None) => {
            CommandError::new(error.code, format!("{}. {}", error.message, primary))
        }
        (None, Some(hint)) => CommandError::new(error.code, format!("{}. {}", error.message, hint)),
        (Some(hint_a), Some(hint_b)) => CommandError::new(
            error.code,
            format!("{}. {} {}", error.message, hint_a, hint_b),
        ),
    }
}

fn relation_does_not_exist_hint(
    connection: &ResolvedConnectionProfile,
    _query_text: &str,
    error_message: &str,
) -> Option<String> {
    let lowered = error_message.to_lowercase();
    let relation = if lowered.contains("relation") && lowered.contains("does not exist") {
        let marker = "relation \"";
        let start = lowered.find(marker)?;
        let relation_with_quote = &lowered[start + marker.len()..];
        relation_with_quote.find('"').and_then(|end| {
            let relation = &relation_with_quote[..end];
            if relation.trim().is_empty() {
                None
            } else {
                Some(relation.to_string())
            }
        })?
    } else {
        let marker = "invalid object name '";
        let start = lowered.find(marker)?;
        let relation_with_quote = &lowered[start + marker.len()..];
        relation_with_quote.find('\'').and_then(|end| {
            let relation = &relation_with_quote[..end];
            if relation.trim().is_empty() {
                None
            } else {
                Some(relation.to_string())
            }
        })?
    };

    if relation.is_empty() {
        return None;
    }

    let relation = relation.replace("[", "").replace("]", "");
    let target_hint = if connection.engine == "sqlserver" {
        if relation.contains('.') {
            "Use `schema.object`-style naming when possible, for example [dbo].[orders]."
                .to_string()
        } else {
            "Use `schema.table` naming and verify the object exists in the active database."
                .to_string()
        }
    } else {
        "Try using the schema-qualified form: `schema.table` (or \"schema\".\"table\" for case-sensitive names)."
            .to_string()
    };

    let mut parts = Vec::new();
    parts.push(format!(
        "Detected missing relation `{relation}`. Ensure the relation exists and is in the active schema."
    ));
    parts.push(target_hint);
    parts.push(
        "Check available schemas/tables in the Explorer panel if the object should exist."
            .to_string(),
    );
    if connection.engine == "postgresql"
        && connection
            .database
            .as_deref()
            .is_none_or(|database| database.eq_ignore_ascii_case("postgres"))
    {
        parts.push(
            "This connection did not define an explicit database, so the driver may be using a default database. "
                .to_string()
                + "Verify the target database (for example observability) and open the table from an Explorer-generated query template."
        );
    }

    Some(parts.join(" "))
}
