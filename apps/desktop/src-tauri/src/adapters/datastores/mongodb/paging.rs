use futures_util::TryStreamExt;
use mongodb::bson::{self, doc, Document};
use serde_json::{json, Value};

use super::super::super::*;
use super::connection::mongodb_client;

pub(crate) async fn fetch_mongodb_page(
    connection: &ResolvedConnectionProfile,
    request: &ResultPageRequest,
) -> Result<ResultPageResponse, CommandError> {
    let page_size = bounded_page_size(request.page_size);
    let page_index = request.page_index.unwrap_or(1);
    let client = mongodb_client(connection).await?;
    let database_name = connection
        .database
        .clone()
        .unwrap_or_else(|| "admin".into());
    let database = client.database(&database_name);
    let input = serde_json::from_str::<serde_json::Value>(selected_page_query(request))?;
    let collection_name = input
        .get("collection")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CommandError::new(
                "mongodb-query-shape",
                "MongoDB queries must include a `collection` field for paging.",
            )
        })?;
    let collection = database.collection::<Document>(collection_name);
    let skip = u64::from(page_index) * u64::from(page_size);
    let documents = if let Some(pipeline) = input.get("pipeline").and_then(Value::as_array) {
        let mut pipeline = pipeline
            .iter()
            .map(bson::to_document)
            .collect::<Result<Vec<Document>, _>>()?;
        pipeline.push(doc! { "$skip": i64::try_from(skip).unwrap_or(i64::MAX) });
        pipeline.push(doc! { "$limit": i64::from(page_size + 1) });
        collection
            .aggregate(pipeline)
            .await?
            .try_collect::<Vec<Document>>()
            .await?
    } else {
        let filter = input.get("filter").cloned().unwrap_or_else(|| json!({}));
        collection
            .find(bson::to_document(&filter)?)
            .skip(skip)
            .limit(i64::from(page_size + 1))
            .await?
            .try_collect::<Vec<Document>>()
            .await?
    };
    let has_more = documents.len() > page_size as usize;
    let visible_documents = documents
        .iter()
        .take(page_size as usize)
        .collect::<Vec<&Document>>();
    let buffered_rows = visible_documents.len() as u32;

    Ok(page_response(
        request,
        payload_document(serde_json::to_value(visible_documents)?),
        PageResponseInput {
            page_size,
            page_index,
            buffered_rows,
            has_more,
            next_cursor: None,
            notices: Vec::new(),
        },
    ))
}
