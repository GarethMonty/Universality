use super::super::super::*;

pub(crate) fn cockroach_root_nodes(connection: &ResolvedConnectionProfile) -> Vec<ExplorerNode> {
    [
        (
            "cockroach-jobs",
            "Jobs",
            "cluster-jobs",
            "Schema changes, imports, backups, restores, and long-running jobs",
            "cockroach:jobs",
            "show jobs;",
        ),
        (
            "cockroach-roles",
            "Roles and grants",
            "security",
            "SQL users, roles, grants, and default privileges",
            "cockroach:roles",
            "show roles; show grants;",
        ),
        (
            "cockroach-regions",
            "Regions and localities",
            "topology",
            "Multi-region database, locality, and survival goal metadata",
            "cockroach:regions",
            "show regions;",
        ),
        (
            "cockroach-ranges",
            "Ranges",
            "range",
            "Range distribution, hot spots, and locality-aware placement",
            "cockroach:ranges",
            "show ranges from table public.sample_table;",
        ),
        (
            "cockroach-sessions",
            "Sessions",
            "session",
            "Active SQL sessions and cancellation candidates",
            "cockroach:sessions",
            "show sessions;",
        ),
        (
            "cockroach-contention",
            "Contention",
            "contention",
            "Lock waits and transaction contention signals",
            "cockroach:contention",
            "select * from crdb_internal.cluster_locks limit 100;",
        ),
        (
            "cockroach-cluster-status",
            "Cluster status",
            "cluster",
            "Nodes, liveness, settings, and status surfaces",
            "cockroach:cluster-status",
            "show cluster setting version;",
        ),
    ]
    .into_iter()
    .map(|(id, label, kind, detail, scope, query)| ExplorerNode {
        id: id.into(),
        family: "sql".into(),
        label: label.into(),
        kind: kind.into(),
        detail: detail.into(),
        scope: Some(scope.into()),
        path: Some(vec![connection.name.clone(), "CockroachDB".into()]),
        query_template: Some(query.into()),
        expandable: Some(true),
    })
    .collect()
}
