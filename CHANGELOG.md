# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/); prerelease builds are not yet a
stable compatibility promise.

## [0.2.0-beta.1] - Unreleased

### Added

- Bundled local stdio runtime for read-only Data Health access using a token configured outside Codex conversations.
- Windows setup, status, rotation, and removal workflow using current-user DPAPI protection.
- Disabled-by-default startup, local `noauth` tool declarations, and environment-based setup for non-Windows systems.
- Authenticated connection API for validating and envelope-encrypting user-submitted Dext credentials outside MCP conversations.
- User-owned Data Health and Commerce connections with principal-level PostgreSQL row-level security for credentials, snapshots, and permalinks.
- Read-only Dext Commerce invoice and bill provider, `list_invoices`, and `get_invoice` tools using the documented sandbox and production hosts.
- Unified standard `search` and `fetch` across enabled Data Health and Commerce modules.
- Local plugin release gates plus deferred hosted-plugin preparation checks.

### Changed

- The installable plugin starts with provider modules disabled unless it finds an external credential.
- Release archives contain the portable local bundle and setup documentation, without fixture records or hosted-service dependencies.

### Security

- Connection lookup, credential decryption, snapshots, and record links are bound to both the authenticated tenant and user.
- Local Windows credentials use DPAPI current-user protection; local tool results report only credential presence and source.
- No test or CI path authenticates to Dext; Commerce and Data Health HTTP coverage uses mocked or loopback-only transports.

## [0.1.0-beta.2] - 2026-08-01

### Added

- Installable Codex plugin manifest and repository-backed marketplace entry.
- Self-contained Node 24 stdio bundle that exposes all twelve tools with fictional fixture data.
- Plugin branding, starter prompts, portable validation, bundle synchronization, and release archives.

### Security

- The plugin runtime constructs only fixture providers and in-memory repositories.
- Live-provider, PostgreSQL, credential, and production configuration code is excluded from the plugin bundle.
- Hostile live-mode environment variables cannot change the plugin from fixture mode.

## [0.1.0-beta.1] - 2026-08-01

### Added

- Tool-only MCP server for Dext Data Health with standard `search` and `fetch`.
- Direct client, portfolio, risk, comparison, and snapshot tools.
- Tenant-scoped OAuth identity mapping, PostgreSQL repositories, and forced RLS.
- AES-256-GCM envelope-encrypted per-connection Dext credentials.
- Opaque tenant-bound permalinks and pagination cursors.
- Fixture-only local test mode, PostgreSQL isolation tests, and Docker secret canaries.

### Security

- Live Dext mode requires an explicit gate, durable tenant storage, and encrypted credentials.
- Tests reject live mode and never use browser sessions or company-account credentials.

[0.1.0-beta.1]: https://github.com/bidule995/dext-codex-connector/releases/tag/v0.1.0-beta.1
[0.1.0-beta.2]: https://github.com/bidule995/dext-codex-connector/releases/tag/v0.1.0-beta.2
[0.2.0-beta.1]: https://github.com/bidule995/dext-codex-connector/compare/v0.1.0-beta.2...v0.2.0-beta.1
