use super::super::super::*;
use super::connection::redis_connection;

pub(crate) async fn fetch_redis_page(
    connection: &ResolvedConnectionProfile,
    request: &ResultPageRequest,
) -> Result<ResultPageResponse, CommandError> {
    let page_size = bounded_page_size(request.page_size);
    let page_index = request.page_index.unwrap_or_default();
    let cursor = request
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or_default();
    let line = selected_page_query(request);
    let parts = line.split_whitespace().collect::<Vec<&str>>();
    let pattern = parts
        .windows(2)
        .find(|window| window[0].eq_ignore_ascii_case("MATCH"))
        .map(|window| window[1])
        .unwrap_or("*");
    let mut redis = redis_connection(connection).await?;
    let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(page_size)
        .query_async(&mut redis)
        .await?;
    let has_more = next_cursor != 0;
    let buffered_rows = keys.len() as u32;

    Ok(page_response(
        request,
        payload_table(
            vec!["key".into()],
            keys.into_iter().map(|key| vec![key]).collect(),
        ),
        PageResponseInput {
            page_size,
            page_index: page_index + 1,
            buffered_rows,
            has_more,
            next_cursor: if has_more {
                Some(next_cursor.to_string())
            } else {
                None
            },
            notices: Vec::new(),
        },
    ))
}
