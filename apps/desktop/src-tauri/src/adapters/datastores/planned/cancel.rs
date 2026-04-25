use super::super::super::*;
use super::preview::spec_has;
use super::spec::BetaAdapterSpec;

pub(super) fn beta_cancel_result(
    spec: &BetaAdapterSpec,
    request: &CancelExecutionRequest,
) -> CancelExecutionResult {
    CancelExecutionResult {
        ok: false,
        supported: spec_has(spec, "supports_query_cancellation"),
        message: format!(
            "{} cancellation surface is registered for execution {}, but no live execution is active in beta preview mode.",
            spec.label, request.execution_id
        ),
    }
}
