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
- integration tests
- production build
