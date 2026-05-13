# Security And Safety

Datanaut is expected to handle live credentials and production systems, so security and safety need to be part of the architecture rather than later polish.

## Secret handling

Preferred approach:

- store secret values in the OS credential store or keychain
- keep only references in regular app persistence
- redact secret values in logs, previews, and exports by default
- require explicit opt-in for any export that includes secrets

## Environment safeguards

Environments are first-class and should carry visible risk context:

- Local / Dev: standard workflow
- QA / UAT / Stage: elevated awareness
- Prod: persistent warning state, stricter confirmation, optional safe mode

The active environment should remain visible in the shell, explorer, editor, and result views.

## Guardrails

Guardrails should be policy-driven and connection-aware:

- read-only connection mode
- confirmation for destructive operations
- banners for production or restricted environments
- warnings for large result sets or long-running operations
- unresolved variable detection before connect or execute

## Desktop protection

The native layer should support:

- app-level locking after inactivity
- optional master password or biometric unlock when feasible
- encrypted exports for portable artifacts
- clear separation between UI code and privileged native commands

## Tracked dependency exceptions

- `monaco-editor` currently pulls a moderate `dompurify` advisory through the editor dependency chain. Do not run `npm audit fix --force` or downgrade Monaco to clear this artificially; keep the advisory tracked and upgrade Monaco when an upstream patch is available.
