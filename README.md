# Dext Codex Connector

[![CI](https://github.com/bidule995/dext-codex-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/bidule995/dext-codex-connector/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bidule995/dext-codex-connector/actions/workflows/codeql.yml/badge.svg)](https://github.com/bidule995/dext-codex-connector/actions/workflows/codeql.yml)
[![GitHub prerelease](https://img.shields.io/github/v/release/bidule995/dext-codex-connector?include_prereleases&label=release)](https://github.com/bidule995/dext-codex-connector/releases)
[![License](https://img.shields.io/github/license/bidule995/dext-codex-connector)](LICENSE)

Installable Codex plugin containing an MCP connector for Dext Data Health & Insights. The same repository also contains a separately deployable HTTP service, while researched Dext Commerce contracts and the Dext Prepare boundary remain behind explicit release gates.

> [!IMPORTANT]
> This is an independent, unofficial project. It is not affiliated with or endorsed by Dext. The Codex plugin in this beta is deliberately fixture-only and cannot connect to a Dext account.

The plugin is safe to run locally: its committed stdio bundle hard-codes three fictional companies and process-local memory. It does not load the production configuration, PostgreSQL repositories, Dext HTTP provider, credential decryptor, browser state, cookies, or process-wide Dext tokens. The hosted-service code retains guarded live-provider support for a future isolated staging deployment, but that path is not present in the installed plugin bundle.

## Install in Codex

Requires Node.js 24. No checkout, package-manager install, database, Dext token, or OAuth setup is needed.

```powershell
codex plugin marketplace add bidule995/dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

Start a new Codex task after installation so the `dext` tools are loaded. Confirm the safety boundary with `connection_status`; it must report `providerMode: fixture` and `liveDextRequestsEnabled: false`.

See [Codex plugin installation and lifecycle](docs/codex-plugin.md) for upgrades, uninstall, rollback, privacy, and local development details.

## Implemented surface

| Area | State |
| --- | --- |
| Native Codex plugin and marketplace | Implemented; fixture-only beta |
| Self-contained stdio MCP bundle | Implemented; Node 24, no `node_modules` required |
| Streamable HTTP MCP at `/mcp` | Implemented |
| OAuth bearer verification and protected-resource metadata | Implemented; production needs an organization identity provider |
| Development bearer authentication | Implemented; rejected in production |
| Data Health endpoint adapter | Implemented for the 3 public contracts |
| Fixture provider | Implemented and enabled by default |
| Standard `search` and `fetch` | Implemented with exact text-only result shapes |
| Direct Data Health tools | Implemented |
| Portfolio, risk, and client comparison | Implemented |
| Tenant-scoped connections, credentials, snapshots, links, identities, and audit | Implemented in memory where safe and PostgreSQL for production |
| Audit events and 60-request fixed-window limit | Implemented |
| Stable authenticated record links | Implemented as short opaque UUID links |
| PostgreSQL storage and row-level security | Implemented with tenant-integrity migration and forced RLS |
| Commerce | 33 contracts catalogued; no tools or live adapter registered |
| Prepare | Disabled pending first-party partner contracts |
| Custom Apps SDK UI | Not included; Codex uses the native plugin/tool experience |

Registered tools:

- `connection_status`, `list_capabilities`
- `search`, `fetch`
- `list_clients`, `get_client`, `get_client_activity_stats`
- `summarize_portfolio_health`, `find_client_health_risks`, `compare_clients`
- `snapshot_health_metrics`, `compare_health_snapshots`

## Safety boundaries

- The installed Codex plugin always constructs the fixture provider and in-memory repositories directly.
- Plugin behavior cannot be changed by `DEXT_DATA_SOURCE`, database, credential, or production-mode environment variables.
- The plugin bundle excludes the Dext HTTP adapter, PostgreSQL driver, Fastify, and credential decryption code.
- `DEXT_DATA_SOURCE` defaults to `fixture`.
- Tests reject `DEXT_DATA_SOURCE=live` even if the live flag is set.
- Live mode requires the explicit live flag, PostgreSQL, a tenant connection, and an envelope-encrypted credential stored for that connection.
- There is no global Dext token environment variable or fallback connection.
- The live adapter accepts only `https://api.precision.dext.com/`.
- Commerce and Prepare tools are not registered.
- Authentication and scope checks run before tool execution.
- Audit records contain tool names, actors, outcomes, and target IDs—not tool payloads or credentials.
- Record links contain only a random UUID; resolution is authenticated and bound to both tenant and upstream connection.
- Development authentication is invalid when `NODE_ENV=production`.
- Production additionally requires hosted OAuth, a public HTTPS origin, PostgreSQL, a non-loopback bind address, a credential master key, and a dedicated cursor key.

Do not use a personal or company Dext token for development. Provider testing belongs in a dedicated Dext test tenant or Commerce sandbox.

## Local HTTP fixture service

This is a development path for the separate HTTP service, not the normal Codex plugin installation. It requires Node 24 and pnpm 11.9.0.

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

The service exposes:

- `http://localhost:3000/healthz`
- `http://localhost:3000/mcp`
- `http://localhost:3000/.well-known/oauth-protected-resource`

Use the bearer token from the local `.env` only for fixture-mode development. For MCP Inspector, connect to `/mcp` and send `Authorization: Bearer <local development token>`.

## Validation

```powershell
pnpm check
```

The suite covers plugin manifest and marketplace validation, deterministic bundle synchronization, stdio process startup from an unrelated directory, all twelve tools under hostile live-mode environment values, ephemeral snapshots, package contents, configuration gates, envelope decryption, opaque cursor and permalink isolation, bounded risk/portfolio scans, schema drift tolerance, rate limiting, tenant-scoped providers and snapshots, mocked HTTP authorization, the 33-contract Commerce catalog, canonical MCP security declarations, exact `search`/`fetch` shapes, audit redaction, OAuth challenges, CORS, and unauthenticated rejection.

No test contacts Dext. When `TEST_DATABASE_URL` points to a loopback database whose name contains `test`, integration tests apply both migrations and prove cross-tenant foreign keys and row-level security. CI supplies such a PostgreSQL 17 service. Docker packaging validation also builds an isolated canary image and checks its history, layers, and filesystem; it requires a running Docker daemon.

Useful focused checks:

```powershell
pnpm test:integration
pnpm test:packaging:static
pnpm test:packaging:docker
pnpm check:plugin
pnpm audit --prod
```

The official local Codex plugin validator can also be run with:

```powershell
python C:\Users\cesar\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py .
```

## Production prerequisites

Before enabling a real Dext connection:

1. Obtain a dedicated Data Health credential for an isolated, non-company Dext test tenant.
2. Configure an OAuth 2.1 identity provider and provision external subject/tenant mappings plus membership grants.
3. Apply `migrations/0001_foundation.sql` and `migrations/0002_tenant_integrity.sql` as the migration owner. Run the service through a login role granted the non-owner `dext_connector_app` role.
4. Provision one active Data Health connection per tenant and store its token using envelope encryption. Supply the 32-byte base64url `CREDENTIAL_MASTER_KEY` from a secret manager.
5. Set a separate random `CURSOR_ENCRYPTION_KEY`, configure backups/retention, and verify structured telemetry redaction.
6. Run PostgreSQL, Docker canary, MCP Inspector, Codex, and ChatGPT checks against isolated staging.
7. Enable `DEXT_DATA_SOURCE=live` and `DEXT_LIVE_REQUESTS_ENABLED=true` only for the approved isolated connection.
8. Keep Commerce disabled until Dext sandbox tests prove the endpoints used by each tool group.

Risk searches that require client details consume at most `RISK_DETAIL_REQUEST_BUDGET` detail requests per page and return an opaque continuation cursor when more candidates remain. Summary-only filters make no detail calls. Portfolio summaries inspect at most 20 deterministically selected clients and keep structured output below the connector's 64 KiB bound.

See [Security and data handling](docs/security-and-data-handling.md), [provider validation](docs/provider-validation.md), and [module release gates](docs/module-release-gates.md).
