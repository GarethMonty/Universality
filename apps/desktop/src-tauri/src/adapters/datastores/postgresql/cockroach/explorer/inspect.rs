use serde_json::{json, Value};

use super::super::super::*;

pub(crate) fn inspect_cockroach_node(
    connection: &ResolvedConnectionProfile,
    node_id: &str,
) -> Option<(String, String, Value)> {
    let (summary, query_template, category, warning) = match node_id {
        "cockroach-jobs" | "cockroach-jobs-running" | "cockroach-jobs-history" => (
            "CockroachDB jobs inspection ready.",
            "show jobs;",
            "jobs",
            "Job visibility can depend on VIEWJOB/admin privileges.",
        ),
        "cockroach-roles" | "cockroach-show-roles" | "cockroach-show-grants" => (
            "CockroachDB role and grant inspection ready.",
            "show roles; show grants;",
            "security",
            "Grant visibility depends on the connected SQL user.",
        ),
        "cockroach-default-privileges" => (
            "CockroachDB default privilege inspection ready.",
            "show default privileges;",
            "security",
            "Default privilege visibility depends on the connected SQL user.",
        ),
        "cockroach-regions" | "cockroach-show-regions" | "cockroach-localities" => (
            "CockroachDB region/locality inspection ready.",
            "show regions; show localities;",
            "topology",
            "Multi-region metadata varies by cluster configuration.",
        ),
        "cockroach-ranges" | "cockroach-table-ranges" | "cockroach-range-hotspots" => (
            "CockroachDB range inspection ready.",
            "show ranges from table public.sample_table;",
            "ranges",
            "Range diagnostics may require table-specific context.",
        ),
        "cockroach-sessions" | "cockroach-show-sessions" | "cockroach-cancel-session-plan" => (
            "CockroachDB session inspection ready.",
            "show sessions;",
            "sessions",
            "Cancellation is generated as a guarded operation plan.",
        ),
        "cockroach-contention" | "cockroach-cluster-locks" | "cockroach-statement-contention" => (
            "CockroachDB contention diagnostics ready.",
            "select * from crdb_internal.cluster_locks limit 100;",
            "contention",
            "Use production-supported crdb_internal objects only when the cluster allows it.",
        ),
        "cockroach-cluster-status" | "cockroach-cluster-version" | "cockroach-node-status" => (
            "CockroachDB cluster status inspection ready.",
            "show cluster setting version;",
            "cluster",
            "Node status visibility depends on cluster settings and permissions.",
        ),
        _ => return None,
    };

    Some((
        format!("{summary} ({})", connection.name),
        query_template.into(),
        json!({
            "engine": "cockroachdb",
            "nodeId": node_id,
            "category": category,
            "warning": warning,
            "operations": ["metadata.refresh", "query.explain", "query.profile", "security.inspect", "diagnostics.metrics"],
        }),
    ))
}
