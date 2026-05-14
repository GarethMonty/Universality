use super::*;

pub(super) fn object_kinds(manifest: &AdapterManifest) -> Vec<DatastoreExperienceObjectKind> {
    match manifest.family.as_str() {
        "sql" | "embedded-olap" => sql_object_kinds(manifest),
        "document" => vec![
            object_kind(
                "database",
                "Databases",
                "Document database namespaces.",
                &["collection"],
                false,
            ),
            object_kind(
                "collection",
                "Collections",
                "Queryable document containers.",
                &["document", "index"],
                true,
            ),
            object_kind(
                "document",
                "Documents",
                "JSON/BSON-like values that can be inspected and edited.",
                &["field"],
                false,
            ),
            object_kind(
                "field",
                "Fields",
                "Nested document keys and values.",
                &[],
                false,
            ),
            object_kind(
                "index",
                "Indexes",
                "Collection index definitions and access paths.",
                &[],
                false,
            ),
        ],
        "keyvalue" => vec![
            object_kind(
                "database",
                "Databases",
                "Logical key namespaces where supported.",
                &["key"],
                false,
            ),
            object_kind("key", "Keys", "Typed key/value entries.", &[], true),
            object_kind(
                "stream",
                "Streams",
                "Append-only event streams where supported.",
                &[],
                true,
            ),
        ],
        "search" => vec![
            object_kind(
                "cluster",
                "Cluster",
                "Search cluster health and topology.",
                &["index", "data-stream"],
                false,
            ),
            object_kind(
                "index",
                "Indexes",
                "Queryable search indexes and mappings.",
                &["mapping"],
                true,
            ),
            object_kind(
                "data-stream",
                "Data Streams",
                "Time-ordered backing indexes.",
                &[],
                true,
            ),
            object_kind(
                "mapping",
                "Mappings",
                "Field mappings and analyzers.",
                &[],
                false,
            ),
        ],
        "widecolumn" => vec![
            object_kind(
                "keyspace",
                "Keyspaces",
                "Wide-column namespaces or tablespaces.",
                &["table"],
                false,
            ),
            object_kind(
                "table",
                "Tables",
                "Partition-key oriented tables.",
                &["index"],
                true,
            ),
            object_kind(
                "index",
                "Indexes",
                "Secondary indexes and access paths.",
                &[],
                false,
            ),
            object_kind(
                "item",
                "Items / Rows",
                "Key-addressed wide-column items or rows.",
                &[],
                false,
            ),
        ],
        _ => vec![object_kind(
            "connection",
            "Connection",
            "Engine-specific objects exposed by the adapter.",
            &[],
            true,
        )],
    }
}

fn sql_object_kinds(manifest: &AdapterManifest) -> Vec<DatastoreExperienceObjectKind> {
    let mut kinds = vec![
        object_kind(
            "database",
            "Databases",
            "Database catalogs and attached files.",
            &["schema"],
            false,
        ),
        object_kind(
            "schema",
            "Schemas",
            "Namespaces containing tables, views, and routines.",
            &["table", "view", "index"],
            false,
        ),
        object_kind(
            "table",
            "Tables",
            "Queryable row sets with columns, indexes, and constraints.",
            &["column", "index"],
            true,
        ),
        object_kind(
            "view",
            "Views",
            "Stored query definitions that can be queried like tables.",
            &[],
            true,
        ),
        object_kind(
            "index",
            "Indexes",
            "Engine-native access paths and constraints.",
            &[],
            false,
        ),
        object_kind(
            "column",
            "Columns",
            "Table fields and data types.",
            &[],
            false,
        ),
    ];

    if manifest.engine == "sqlserver" {
        kinds.push(object_kind(
            "procedure",
            "Stored Procedures",
            "T-SQL procedures, functions, and executable database routines.",
            &[],
            true,
        ));
    }

    if manifest.engine == "sqlite" {
        kinds.push(object_kind(
            "trigger",
            "Triggers",
            "SQLite trigger definitions attached to tables.",
            &[],
            false,
        ));
    }

    kinds
}

fn object_kind(
    kind: &str,
    label: &str,
    description: &str,
    child_kinds: &[&str],
    queryable: bool,
) -> DatastoreExperienceObjectKind {
    DatastoreExperienceObjectKind {
        kind: kind.into(),
        label: label.into(),
        description: description.into(),
        child_kinds: child_kinds.iter().map(|item| (*item).into()).collect(),
        queryable,
        supports_context_menu: true,
    }
}
