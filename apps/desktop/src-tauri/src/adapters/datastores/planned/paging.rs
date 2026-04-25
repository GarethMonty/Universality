use super::super::super::*;

pub(super) fn beta_page_response(request: &ResultPageRequest) -> ResultPageResponse {
    ResultPageResponse {
        tab_id: request.tab_id.clone(),
        result_id: None,
        payload: payload_raw(
            "Beta adapter pagination is available once the live execution driver returns a cursor."
                .into(),
        ),
        page_info: ResultPageInfo {
            page_size: bounded_page_size(request.page_size),
            page_index: request.page_index.unwrap_or(0),
            buffered_rows: 1,
            has_more: false,
            next_cursor: None,
            total_rows_known: Some(1),
        },
        notices: vec![
            "No additional pages are available for beta request-builder preview results.".into(),
        ],
    }
}
