use std::collections::BTreeMap;

use serde_json::Value;

use crate::domain::models::{AdapterManifest, OperationPlan, ResolvedConnectionProfile};

pub(crate) fn default_object_name(manifest: &AdapterManifest, provided: Option<&str>) -> String {
    provided
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| match manifest.family.as_str() {
            "document" => "sample_collection".into(),
            "keyvalue" => "sample:key".into(),
            "graph" => "SampleLabel".into(),
            "timeseries" => "sample_measurement".into(),
            "widecolumn" => "sample_table".into(),
            "search" => "sample-index".into(),
            "warehouse" | "embedded-olap" | "sql" => "public.sample_table".into(),
            _ => "sample_object".into(),
        })
}

pub(crate) fn generated_operation_request(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    operation_id: &str,
    object_name: &str,
    parameters: Option<&BTreeMap<String, Value>>,
) -> String {
    let parameter_json = parameters
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".into()))
        .unwrap_or_else(|| "{}".into());

    match manifest.family.as_str() {
        "sql" | "warehouse" | "embedded-olap" | "timeseries"
            if manifest.default_language.ends_with("sql") || manifest.default_language == "sql" =>
        {
            if operation_id.ends_with("index.create") {
                return format!("create index idx_sample on {object_name} (id);");
            }

            if operation_id.ends_with("index.drop") {
                return "drop index idx_sample;".into();
            }

            match operation_id.rsplit('.').next().unwrap_or(operation_id) {
                "refresh" => "select table_schema, table_name from information_schema.tables order by table_schema, table_name;".into(),
                "execute" => format!("select * from {object_name} limit 100;"),
                "explain" => format!("explain select * from {object_name} limit 100;"),
                "profile" if manifest.engine == "cockroachdb" => {
                    format!("explain analyze (distsql) select * from {object_name} limit 100;")
                }
                "profile" => format!("explain analyze select * from {object_name} limit 100;"),
                "create" => format!("create table {object_name} (\n  id text primary key,\n  created_at timestamp\n);"),
                "drop" => format!("drop table {object_name};"),
                "inspect" if manifest.engine == "cockroachdb" => "show grants; show roles;".into(),
                "inspect" => "select * from information_schema.role_table_grants;".into(),
                "metrics" if manifest.engine == "cockroachdb" => {
                    "show jobs; show sessions; select * from crdb_internal.cluster_locks limit 100;".into()
                }
                "metrics" => "select current_timestamp as sampled_at;".into(),
                _ => format!("-- {operation_id}\n-- connection: {}\n-- parameters:\n{parameter_json}", connection.name),
            }
        }
        "document" => match operation_id.rsplit('.').next().unwrap_or(operation_id) {
            "refresh" => "{\n  \"listCollections\": true\n}".into(),
            "execute" => format!("{{\n  \"collection\": \"{object_name}\",\n  \"filter\": {{}},\n  \"limit\": 100\n}}"),
            "explain" | "profile" => format!("{{\n  \"collection\": \"{object_name}\",\n  \"explain\": true,\n  \"filter\": {{}}\n}}"),
            "create" => format!("{{\n  \"createCollection\": \"{object_name}\"\n}}"),
            "drop" => format!("{{\n  \"dropCollection\": \"{object_name}\"\n}}"),
            _ => format!("{{\n  \"operation\": \"{operation_id}\",\n  \"parameters\": {parameter_json}\n}}"),
        },
        "keyvalue" => match operation_id.rsplit('.').next().unwrap_or(operation_id) {
            "refresh" | "execute" => format!("SCAN 0 MATCH {object_name}* COUNT 100"),
            "metrics" => "INFO\nSLOWLOG GET 20".into(),
            _ => format!("# {operation_id}\n# parameters:\n{parameter_json}"),
        },
        "graph" => match manifest.default_language.as_str() {
            "cypher" => format!("MATCH (n) RETURN n LIMIT 100\n// {operation_id} {object_name}"),
            "aql" => format!("FOR doc IN {object_name} LIMIT 100 RETURN doc"),
            _ => format!("g.V().limit(100) // {operation_id} {object_name}"),
        },
        "search" => format!(
            "{{\n  \"index\": \"{object_name}\",\n  \"body\": {{\n    \"query\": {{ \"match_all\": {{}} }},\n    \"size\": 100\n  }},\n  \"operation\": \"{operation_id}\"\n}}"
        ),
        "widecolumn" => match manifest.default_language.as_str() {
            "cql" => format!("select * from {object_name} limit 100;"),
            _ => format!("{{\n  \"TableName\": \"{object_name}\",\n  \"Limit\": 100,\n  \"Operation\": \"{operation_id}\"\n}}"),
        },
        _ => format!("{operation_id}\n{parameter_json}"),
    }
}

pub(crate) fn default_operation_plan(
    connection: &ResolvedConnectionProfile,
    manifest: &AdapterManifest,
    operation_id: &str,
    object_name: Option<&str>,
    parameters: Option<&BTreeMap<String, Value>>,
) -> OperationPlan {
    let object_name = default_object_name(manifest, object_name);
    let destructive = operation_id.contains(".drop") || operation_id.contains("backup-restore");
    let costly = destructive
        || operation_id.contains(".profile")
        || operation_id.contains("import-export")
        || operation_id.contains("metrics");
    let generated_request =
        generated_operation_request(connection, manifest, operation_id, &object_name, parameters);
    let required_permissions = if destructive {
        vec!["owner/admin role or equivalent destructive privilege".into()]
    } else if operation_id.contains(".create")
        || operation_id.contains("import-export")
        || operation_id.contains("backup-restore")
    {
        vec!["write/admin privilege for the target object".into()]
    } else {
        vec!["read metadata/query privilege".into()]
    };
    let mut warnings = Vec::new();

    if manifest.maturity == "beta" {
        warnings.push("This beta adapter returns a guarded operation plan before live mutation support is enabled.".into());
    }
    if connection.read_only {
        warnings.push("The selected connection profile is read-only; write, admin, and destructive execution will be blocked.".into());
    }
    if costly {
        warnings.push("This operation can execute workload, scan data, consume cloud resources, or affect cluster state.".into());
    }

    OperationPlan {
        operation_id: operation_id.into(),
        engine: manifest.engine.clone(),
        summary: format!("Prepared {} operation for {object_name}.", manifest.label),
        generated_request,
        request_language: manifest.default_language.clone(),
        destructive,
        estimated_cost: if costly {
            Some("Unknown until the live adapter runs an engine-specific dry run/profile.".into())
        } else {
            Some("No material cost expected for metadata/read preview.".into())
        },
        estimated_scan_impact: if operation_id.contains(".execute")
            || operation_id.contains(".profile")
            || operation_id.contains("metrics")
        {
            Some("Bound by the generated limit where possible; profile/analyze variants may execute the query.".into())
        } else {
            Some("Metadata-only or object-scoped.".into())
        },
        required_permissions,
        confirmation_text: if destructive || costly || connection.read_only {
            Some(format!("CONFIRM {}", manifest.engine.to_uppercase()))
        } else {
            None
        },
        warnings,
    }
}
