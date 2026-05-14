# Testing Strategy

Datanaut should treat testing as a product feature because connection handling, secret management, and production safeguards are high-trust workflows.

## Test layers

### Unit tests

Cover:

- environment variable resolution
- capability-driven UI selection
- connection configuration validation
- result renderer selection
- saved work transformations

### Integration tests

Cover:

- query execution orchestration
- import and export flows
- adapter normalization behavior
- secret storage boundaries
- production guardrail decisions

### End-to-end tests

Cover:

- connection creation and testing
- opening explorer objects into tabs
- running SQL, Mongo, and Redis workflows
- switching result renderers
- saving and reopening work

## CI gates

Every pull request should run:

- lint
- unit tests
- dependency-free integration and contract tests
- production build

The default GitHub CI path must not require Docker, local database ports, desktop WebDriver, cloud credentials, or live datastore services. Fixture-backed adapter tests and desktop E2E remain available through local/manual commands when a developer explicitly opts into them.
