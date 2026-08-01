# Dext Codex Connector

[![CI](https://github.com/bidule995/dext-codex-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/bidule995/dext-codex-connector/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bidule995/dext-codex-connector/actions/workflows/codeql.yml/badge.svg)](https://github.com/bidule995/dext-codex-connector/actions/workflows/codeql.yml)
[![GitHub prerelease](https://img.shields.io/github/v/release/bidule995/dext-codex-connector?include_prereleases&label=release)](https://github.com/bidule995/dext-codex-connector/releases)
[![License](https://img.shields.io/github/license/bidule995/dext-codex-connector)](LICENSE)

An installable Codex plugin backed by a read-only MCP connector for Dext Data Health and optional Dext Commerce invoice retrieval.

> [!IMPORTANT]
> This is an independent, unofficial project. It is not affiliated with or endorsed by Dext. No development or automated test may use browser cookies, the currently logged-in company account, or a production Dext credential.

## Current release state

The repository now contains the real hosted connector implementation, but the checked-in plugin remains on the fictional local runtime until hosting and OAuth exist. This is intentional:

- `src/server.ts` serves the authenticated Streamable HTTP MCP endpoint at `/mcp`.
- Data Health uses the three documented read endpoints on `api.precision.dext.com`.
- Commerce implements only documented reads for credential validation and invoice/bill transactions; it is disabled by default pending sandbox evidence.
- `PUT /api/connections/{module}` validates and envelope-encrypts a credential for the authenticated user outside MCP conversations.
- PostgreSQL row-level security binds connections, credentials, snapshots, and permalinks to both tenant and user.
- Production refuses fixture mode.
- The release workflow refuses to publish `v0.2` until `.mcp.json` points to a real public HTTPS `/mcp` endpoint with no stdio fallback.

The current public `v0.1.0-beta.2` plugin is still fixture-only. The `0.2.0-beta.1` work on this branch is a deployment candidate, not a live release.

## Tool surface

Every installation exposes:

- `connection_status`, `list_capabilities`
- standard `search`, `fetch`
- `list_clients`, `get_client`, `get_client_activity_stats`
- `summarize_portfolio_health`, `find_client_health_risks`, `compare_clients`
- `snapshot_health_metrics`, `compare_health_snapshots`

When the hosted deployment explicitly enables the reviewed Commerce provider, it also exposes:

- `list_invoices`
- `get_invoice`

`search` and `fetch` use the standard text-only company-knowledge contract and combine the enabled Data Health and Commerce record families. Dext Prepare remains disabled because no current first-party partner API contract has been supplied.

No Dext write, export, delete, file extraction, account-connection, synchronization, password, or two-factor tool is registered.

## Authentication and credentials

There are two separate security legs:

1. Codex authenticates to this connector through OAuth 2.1 and the connector's protected-resource metadata.
2. The connector uses the current user's separately stored Dext credential only for the selected upstream module.

Dext credentials are never MCP inputs. The authenticated HTTPS connection API validates a submitted token against the exact documented host before it encrypts and stores it. Rotation is transactional, and failed validation leaves the current connection unchanged.

Relevant OAuth scopes are `connector.read`, `connections.write`, `records.read`, `health.read`, `health.snapshots.write`, and `commerce.read`. Requested token scopes are intersected with stored membership grants.

See [Authenticated connection API](docs/connection-api.md) and [Security and data handling](docs/security-and-data-handling.md).

## Safe local plugin

Until a hosted prerelease is published, the repository marketplace installs the self-contained fictional stdio plugin. It requires Node.js 24 and cannot read Dext configuration or credentials:

```powershell
codex plugin marketplace add bidule995/dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

Start a new Codex task and verify `connection_status` reports fixture mode. It should contain only Northstar Studio Ltd, Harbor Goods Ltd, and Orchard Labs Ltd.

See [Codex plugin lifecycle](docs/codex-plugin.md) for upgrade, uninstall, migration, and rollback.

## Local hosted-service development

Node.js 24 and pnpm 11.9.0 are required for repository development:

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

The safe defaults use fictional data, memory storage, and a local development bearer. The service exposes:

- `http://localhost:3000/healthz`
- `http://localhost:3000/mcp`
- `http://localhost:3000/.well-known/oauth-protected-resource`
- `http://localhost:3000/api/connections`

Never enable live mode with the company account. Real validation belongs only in an isolated Dext test tenant or the Dext Commerce sandbox.

## Validation

```powershell
pnpm check
python C:\Users\cesar\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py .
```

The suite uses fictional providers, mocked Dext HTTP responses, in-memory MCP transports, local sockets, and an optional loopback PostgreSQL test database whose name must contain `test`. No test authenticates to Dext or performs an upstream network request.

Coverage includes exact `search`/`fetch` shapes, all tool schemas and annotations, OAuth challenges, user-owned provider resolution, credential encryption, redaction, Commerce invoice filters and pagination, Data Health schema drift, bounded rate and risk scans, RLS, plugin isolation, hostile environment variables, packaging, and release drift.

Useful focused checks:

```powershell
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm check:plugin
pnpm audit --prod
```

## Hosted deployment and release

Deployment requires a real public HTTPS origin, OAuth authorization-server registration, PostgreSQL 17, secret management, telemetry redaction, and isolated provider credentials. Apply all three migrations in order. Commerce remains off until its sandbox runbook passes.

After the deployed endpoint passes OAuth and MCP acceptance, convert the plugin manifest:

```powershell
pnpm plugin:prepare-hosted -- --url https://<real-host>/mcp
pnpm check:plugin
pnpm release:verify-hosted
pnpm release:verify-hosted -- --network
```

The last command fails for placeholders, localhost, IP literals, non-HTTPS URLs, paths other than `/mcp`, or any stdio fallback. A `v0.2.0-beta.1` tag must not be created until this check and isolated live acceptance pass.

See [Hosted deployment](docs/hosted-deployment.md), [Provider validation](docs/provider-validation.md), and [Module release gates](docs/module-release-gates.md).
