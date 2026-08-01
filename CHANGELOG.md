# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/); prerelease builds are not yet a
stable compatibility promise.

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
