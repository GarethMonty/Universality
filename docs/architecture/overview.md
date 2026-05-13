# Architecture Overview

Datanaut is structured as a modular desktop workstation with a clear separation between the UI shell, product orchestration, domain contracts, datastore adapters, and privileged native services.

## Layers

### UI layer

The React desktop shell owns:

- workspace layout and navigation
- connection forms and explorer panels
- query editors and results surfaces
- environment banners and safety affordances
- saved work browsing and reuse flows

This layer stays datastore-aware through capabilities, not hardcoded engine branches.

### Application layer

The application layer coordinates:

- connection selection and workspace state
- environment resolution and variable preview
- query execution requests
- result routing to the right renderer
- saved work persistence commands
- guardrail checks before privileged actions

### Domain layer

The shared domain contracts define:

- datastore families and engines
- adapter capability flags
- connection definitions
- environment models
- query tab contracts
- result renderer modes

### Adapter layer

Each datastore integration is isolated behind an adapter contract that covers:

- connection validation
- capability declaration
- metadata discovery
- query or command execution
- result normalization
- error normalization

### Infrastructure layer

The infrastructure and native host provide:

- secure secret storage
- filesystem import and export
- logging and redaction
- update support
- OS integration
- long-running task execution without freezing the UI

## Data flow

1. A user selects a connection and environment in the desktop shell.
2. The application layer resolves variables and evaluates guardrails.
3. The relevant adapter receives a normalized execution request.
4. The adapter returns normalized results and metadata.
5. The UI chooses the best renderer from capability and result metadata.
6. The user can inspect, export, save, compare, or reopen the result later.

## Current boundaries

The current repo foundation uses:

- `apps/desktop/src` for React shell code
- `apps/desktop/src-tauri` for the native host scaffold
- `packages/shared-types` for product contracts
- `docs/` for architecture and onboarding material
