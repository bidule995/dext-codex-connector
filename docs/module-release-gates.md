# Module release gates

## Data Health

The code, offline contracts, PostgreSQL repositories, tenant-scoped provider resolution, envelope decryption, and OAuth identity mapping are implemented. Registration is enabled in fixture mode. A production release still requires isolated live validation of all three documented endpoints, hosted OAuth provisioning, managed secret/KMS operation, backups and retention, MCP Inspector/Codex/ChatGPT host-loop testing, and a rollback drill.

## Commerce

The repository contains a 33-entry endpoint catalog with method, path, mutation, and destructive flags. There is no Commerce HTTP client and no Commerce MCP tool registration.

Before read tools are registered:

- Obtain Dext Commerce sandbox credentials.
- Confirm the documented envelope and opaque cursor behavior.
- Resolve the singular/plural transaction-path discrepancy in the sandbox.
- Capture redacted schemas for the endpoints used by the first tool group.
- Establish conservative concurrency because public rate limits are not documented.

Extraction additionally requires private object storage, malware scanning, file-size and format limits, expiration, and host file-input tests. Account connection and synchronization require a secure browser handoff so credentials and two-factor responses never enter MCP data. Writes and exports require preview and idempotency infrastructure. The two deletion contracts require a separate destructive-operation review.

## Prepare

Prepare is disabled. Public Zapier material is not a first-party API contract for a direct connector. Implementation starts only after Dext supplies current partner endpoints, schemas, authentication, limits, and test access.

## MCP Apps UI and distribution

The first release is tool-only. Add UI resources only after tool workflows pass Codex and ChatGPT tests. Public submission is a distinct product decision requiring production hosting, privacy and support material, reviewer access, screenshots, and directory review.
