use super::*;

mod objects;

use objects::object_kinds;

pub(crate) fn experience_manifest_for_manifest(
    manifest: &AdapterManifest,
) -> DatastoreExperienceManifest {
    DatastoreExperienceManifest {
        engine: manifest.engine.clone(),
        family: manifest.family.clone(),
        label: manifest.label.clone(),
        maturity: manifest.maturity.clone(),
        object_kinds: object_kinds(manifest),
        context_actions: context_actions(manifest),
        query_builders: query_builders(manifest),
        editable_scopes: editable_scopes(manifest),
        diagnostics_tabs: diagnostics_tabs(manifest),
        result_renderers: result_renderers(manifest),
        safety_rules: safety_rules(manifest),
    }
}

fn context_actions(manifest: &AdapterManifest) -> Vec<DatastoreExperienceAction> {
    let mut actions = vec![
        action(
            "open-query",
            "Open Query",
            "query",
            "read",
            Some(format!("{}.query.execute", manifest.engine)),
            true,
            "Open an editor scoped to the selected object.",
        ),
        action(
            "refresh-metadata",
            "Refresh Metadata",
            "connection",
            "read",
            Some(format!("{}.metadata.refresh", manifest.engine)),
            false,
            "Reload engine-native metadata.",
        ),
    ];

    if manifest
        .capabilities
        .iter()
        .any(|item| item == "supports_explain_plan")
    {
        actions.push(action(
            "view-plan",
            "View Execution Plan",
            "query",
            "diagnostic",
            Some(format!("{}.query.explain", manifest.engine)),
            true,
            "Generate the safest non-mutating execution plan supported by the engine.",
        ));
    }

    if manifest
        .capabilities
        .iter()
        .any(|item| item == "supports_index_management")
    {
        actions.push(action(
            "create-index",
            "Create Index",
            "index",
            "write",
            Some(format!("{}.index.create", manifest.engine)),
            true,
            "Preview an engine-specific index creation request.",
        ));
    }

    if manifest
        .capabilities
        .iter()
        .any(|item| item == "supports_permission_inspection")
    {
        actions.push(action(
            "inspect-permissions",
            "Inspect Permissions",
            "role",
            "read",
            Some(format!("{}.security.inspect", manifest.engine)),
            false,
            "Show effective roles, grants, IAM hints, and unavailable actions.",
        ));
    }

    actions
}

fn query_builders(manifest: &AdapterManifest) -> Vec<DatastoreExperienceBuilder> {
    match manifest.engine.as_str() {
        "mongodb" => vec![builder("mongo-find", "Find Builder", "collection", "split")],
        "elasticsearch" | "opensearch" => {
            vec![builder(
                "search-dsl",
                "Search DSL Builder",
                "index",
                "split",
            )]
        }
        "dynamodb" => vec![builder(
            "dynamodb-key-condition",
            "Key Condition Builder",
            "table",
            "split",
        )],
        "redis" | "valkey" => vec![builder("redis-key-browser", "Key Browser", "key", "visual")],
        "cassandra" => vec![builder(
            "cql-partition",
            "Partition Key Builder",
            "table",
            "split",
        )],
        "postgresql" | "cockroachdb" | "sqlserver" | "mysql" | "mariadb" | "sqlite" => {
            vec![builder(
                "sql-select",
                "SQL SELECT Builder",
                "table",
                "split",
            )]
        }
        _ => Vec::new(),
    }
}

fn editable_scopes(manifest: &AdapterManifest) -> Vec<DatastoreEditableScope> {
    match manifest.engine.as_str() {
        "sqlite" => vec![editable_scope(
            "table",
            "Table Rows",
            &["insert-row", "update-row", "delete-row"],
            true,
            true,
        )],
        "postgresql" | "cockroachdb" => vec![editable_scope(
            "table",
            "Table Rows",
            &["insert-row", "update-row", "delete-row"],
            true,
            true,
        )],
        "sqlserver" | "mysql" | "mariadb" => vec![editable_scope(
            "table",
            "Table Rows",
            &["insert-row", "update-row", "delete-row"],
            true,
            true,
        )],
        "mongodb" => vec![editable_scope(
            "collection",
            "Collection Documents",
            &[
                "set-field",
                "unset-field",
                "rename-field",
                "change-field-type",
            ],
            true,
            true,
        )],
        "redis" | "valkey" => vec![editable_scope(
            "key",
            "Keys",
            &[
                "set-key-value",
                "set-ttl",
                "delete-key",
                "rename-key",
                "persist-ttl",
                "hash-set-field",
                "hash-delete-field",
                "list-push",
                "list-set-index",
                "list-remove-value",
                "set-add-member",
                "set-remove-member",
                "zset-add-member",
                "zset-remove-member",
                "stream-add-entry",
                "stream-delete-entry",
                "json-set-path",
                "json-delete-path",
                "timeseries-add-sample",
                "timeseries-delete-sample",
                "vector-add-member",
                "vector-remove-member",
                "vector-set-attributes",
            ],
            false,
            true,
        )],
        "dynamodb" => vec![editable_scope(
            "table",
            "Items",
            &["put-item", "update-item", "delete-item"],
            true,
            true,
        )],
        "elasticsearch" | "opensearch" => vec![editable_scope(
            "index",
            "Documents",
            &["index-document", "update-document", "delete-document"],
            true,
            true,
        )],
        "cassandra" => vec![editable_scope(
            "table",
            "Rows",
            &["update-row"],
            true,
            false,
        )],
        _ => Vec::new(),
    }
}

fn diagnostics_tabs(manifest: &AdapterManifest) -> Vec<DatastoreDiagnosticsTab> {
    let mut tabs = vec![diagnostics_tab(
        "overview",
        "Overview",
        "Connection health, adapter maturity, and metadata status.",
        "metrics",
    )];

    if manifest
        .capabilities
        .iter()
        .any(|item| item == "supports_explain_plan")
    {
        tabs.push(diagnostics_tab(
            "plans",
            "Plans",
            "Execution plans and plan visualization payloads.",
            "plan",
        ));
    }

    if manifest
        .capabilities
        .iter()
        .any(|item| item == "supports_query_profile")
    {
        tabs.push(diagnostics_tab(
            "profiles",
            "Profiles",
            "Query profile and execution-stage details.",
            "profile",
        ));
    }

    if manifest
        .capabilities
        .iter()
        .any(|item| item == "supports_permission_inspection")
    {
        tabs.push(diagnostics_tab(
            "security",
            "Security",
            "Roles, grants, IAM hints, and disabled-action reasons.",
            "table",
        ));
    }

    tabs
}

fn result_renderers(manifest: &AdapterManifest) -> Vec<String> {
    match manifest.family.as_str() {
        "document" => vec!["document", "json", "table", "raw"],
        "keyvalue" => vec!["keyvalue", "table", "json", "raw", "metrics"],
        "search" => vec!["searchHits", "json", "table", "metrics", "profile", "raw"],
        "widecolumn" => vec!["table", "json", "metrics", "raw"],
        "graph" => vec!["graph", "table", "json", "profile"],
        "timeseries" => vec!["series", "chart", "table", "metrics", "json"],
        _ => vec![
            "table", "schema", "json", "plan", "profile", "metrics", "raw",
        ],
    }
    .into_iter()
    .map(String::from)
    .collect()
}

fn safety_rules(manifest: &AdapterManifest) -> Vec<String> {
    let mut rules = vec![
        "Read-only profiles block live data edits before execution.".into(),
        "Destructive and admin operations remain guarded preview plans in this phase.".into(),
        "Safe edits require an unambiguous target and adapter-specific permission checks.".into(),
    ];

    match manifest.family.as_str() {
        "sql" | "embedded-olap" => {
            rules.push("Row updates and deletes require a complete primary-key predicate.".into());
        }
        "document" => {
            rules.push(
                "Document field edits require a stable document id and collection scope.".into(),
            );
        }
        "keyvalue" => {
            rules.push("Key edits are scoped to one key and never run wildcard deletes.".into());
        }
        "widecolumn" => {
            rules.push("Wide-column edits require complete partition-key conditions.".into());
        }
        "search" => {
            rules.push(
                "Index mutations are preview-only; query builders generate read requests.".into(),
            );
        }
        _ => {}
    }

    rules
}

fn action(
    id: &str,
    label: &str,
    scope: &str,
    risk: &str,
    operation_id: Option<String>,
    requires_selection: bool,
    description: &str,
) -> DatastoreExperienceAction {
    DatastoreExperienceAction {
        id: id.into(),
        label: label.into(),
        scope: scope.into(),
        risk: risk.into(),
        operation_id,
        requires_selection,
        description: description.into(),
    }
}

fn builder(kind: &str, label: &str, scope: &str, default_mode: &str) -> DatastoreExperienceBuilder {
    DatastoreExperienceBuilder {
        kind: kind.into(),
        label: label.into(),
        scope: scope.into(),
        default_mode: default_mode.into(),
    }
}

fn editable_scope(
    scope: &str,
    label: &str,
    edit_kinds: &[&str],
    requires_primary_key: bool,
    live_execution: bool,
) -> DatastoreEditableScope {
    DatastoreEditableScope {
        scope: scope.into(),
        label: label.into(),
        edit_kinds: edit_kinds.iter().map(|item| (*item).into()).collect(),
        requires_primary_key,
        live_execution,
    }
}

fn diagnostics_tab(
    id: &str,
    label: &str,
    description: &str,
    default_renderer: &str,
) -> DatastoreDiagnosticsTab {
    DatastoreDiagnosticsTab {
        id: id.into(),
        label: label.into(),
        description: description.into(),
        default_renderer: default_renderer.into(),
    }
}
