use sqlx::types::{
    chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc},
    BigDecimal, Uuid,
};
use sqlx::{Column, Row, TypeInfo};

use super::super::super::*;

pub(crate) fn stringify_pg_cell(row: &sqlx::postgres::PgRow, index: usize) -> String {
    stringify_sqlx_common(
        [
            row.try_get::<Option<String>, _>(index).ok().flatten(),
            row.try_get::<Option<DateTime<Utc>>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_rfc3339()),
            row.try_get::<Option<NaiveDateTime>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<NaiveDate>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<NaiveTime>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<BigDecimal>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
            row.try_get::<Option<Uuid>, _>(index)
                .ok()
                .flatten()
                .map(|item| item.to_string()),
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
