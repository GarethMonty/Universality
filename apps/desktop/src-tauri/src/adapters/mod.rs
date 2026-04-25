use std::collections::BTreeMap;
pub(crate) use std::time::Instant;

use async_trait::async_trait;
use serde_json::Value;

use crate::domain::{
    error::CommandError,
    models::{
        AdapterDiagnostics, AdapterManifest, CancelExecutionRequest, CancelExecutionResult,
        ConnectionTestResult, DatastoreOperationManifest, ExecutionCapabilities, ExecutionRequest,
        ExecutionResultEnvelope, ExplorerInspectRequest, ExplorerInspectResponse, ExplorerNode,
        ExplorerRequest, ExplorerResponse, LocalDatabaseManifest, OperationExecutionRequest,
        OperationExecutionResponse, OperationPlan, PermissionInspection, QueryExecutionNotice,
        ResolvedConnectionProfile, ResultPageInfo, ResultPageRequest, ResultPageResponse,
        StructureEdge, StructureField, StructureGroup, StructureNode, StructureRequest,
        StructureResponse,
    },
};

mod common;
mod contract;
mod datastores;
mod registry;
mod runtime;

pub(crate) use common::*;
pub(crate) use contract::DatastoreAdapter;
pub use registry::{execution_capabilities, manifests};
pub use runtime::{
    cancel, collect_diagnostics, execute, execute_operation, fetch_result_page,
    inspect_explorer_node, inspect_permissions, list_explorer_nodes, load_structure_map,
    operation_manifests, plan_operation, test_connection,
};
