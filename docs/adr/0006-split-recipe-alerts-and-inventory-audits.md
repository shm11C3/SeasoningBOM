# ADR 0006: Split public Recipe Alerts and private Inventory Audits

## Status

Accepted

## Context

The Cloud D1 requirements place both repository security-style alerts and user inventory checks under `nom audit` and the Security tab. Repository content can be public, unlisted, or private, while Inventory is always personal data. A single audit result would make it easy to accidentally expose EOL, unsupported, hazardous, missing, or quantity details from a user's private inventory.

## Decision

Model `nom audit` as an umbrella operation with two source-scoped outputs:

- Recipe Alerts, derived only from Recipe Repository content and visible according to repository visibility.
- Inventory Audits, derived from a Recipe Repository plus the signed-in user's Inventory and visible only to that user.

SeasoningBOM JSON may include Recipe Alerts. It must not include Inventory Audit details.

## Consequences

- The Security tab can show a public `Recipe alerts` section and a signed-in `Your inventory audit` section.
- Public APIs and serialization must keep recipe-derived and inventory-derived issues separate.
- The existing prototype `runNomAudit` combines both sources and needs to be split during the Cloud D1 MVP migration.
- Tests must cover that inventory-derived EOL, unsupported, hazardous, missing, and quantity issues never appear in public repository responses or SeasoningBOM output.
