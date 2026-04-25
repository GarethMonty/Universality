use serde_json::Value;

use super::super::super::*;

pub(super) fn clickhouse_json_payloads(raw: &str) -> (Vec<Value>, u32) {
    let parsed = serde_json::from_str::<Value>(raw).ok();
    let mut payloads = Vec::new();
    let mut row_count = 0_u32;

    if let Some(value) = parsed {
        let columns = value
            .get("meta")
            .and_then(Value::as_array)
            .map(|meta| {
                meta.iter()
                    .filter_map(|item| item.get("name").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();
        let rows = value
            .get("data")
            .and_then(Value::as_array)
            .map(|items| {
                row_count = items.len() as u32;
                items
                    .iter()
                    .map(|item| {
                        columns
                            .iter()
                            .map(|column| {
                                item.get(column)
                                    .map(|field| {
                                        field
                                            .as_str()
                                            .map(str::to_string)
                                            .unwrap_or_else(|| field.to_string())
                                    })
                                    .unwrap_or_default()
                            })
                            .collect::<Vec<String>>()
                    })
                    .collect::<Vec<Vec<String>>>()
            })
            .unwrap_or_default();

        if !columns.is_empty() {
            payloads.push(payload_table(columns, rows));
        }
        payloads.push(payload_json(value));
    }

    if payloads.is_empty() {
        payloads.push(payload_raw(raw.trim().to_string()));
        row_count = raw.lines().filter(|line| !line.trim().is_empty()).count() as u32;
    } else {
        payloads.push(payload_raw(raw.trim().to_string()));
    }

    (payloads, row_count)
}
