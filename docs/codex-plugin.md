# Codex plugin installation and lifecycle

The Codex plugin is the installable distribution unit. Its capability interface is a bundled MCP stdio server. The repository's Fastify/Streamable HTTP service is a separate deployment target and is not started by the plugin.

## Safety and privacy

Version `0.1.0-beta.2` is fixture-only. It uses three fictional companies, a fictional tenant and user, and process-local audit, snapshot, and permalink stores. Data disappears when the MCP process stops.

The plugin bundle does not contain the Dext HTTP provider, PostgreSQL repository, credential decryptor, Fastify server, production configuration loader, or Dext API hostname. Environment variables that request live mode, provide a database URL, or resemble credentials are ignored because the plugin does not read them.

Do not provide Dext credentials in prompts or local plugin configuration. A future live connector will require a hosted HTTPS MCP endpoint, OAuth registration, secret management, and an isolated Dext test tenant. It must not be tested with a personal or company account without separate explicit authorization.

## Install

Install Node.js 24, then add the public repository marketplace and plugin:

```powershell
codex plugin marketplace add bidule995/dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

Start a new Codex task. Call `connection_status` and verify:

- `providerMode` is `fixture`.
- `liveDextRequestsEnabled` is `false`.
- Data Health is enabled while Commerce and Prepare remain disabled.

`list_clients` must return only Northstar Studio Ltd, Harbor Goods Ltd, and Orchard Labs Ltd.

## Upgrade

Refresh the Git marketplace, reinstall the plugin, and start a new task:

```powershell
codex plugin marketplace upgrade dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

## Uninstall

```powershell
codex plugin remove dext-codex-connector@dext-codex-connector
```

The stdio process exits with the task and leaves no plugin database or persistent fixture data.

## Migration from the legacy raw MCP entry

The earlier development installation registered a global MCP server named `dext`. Preserve its command and adapter files until the plugin is accepted, then remove that registration immediately before installing the plugin to avoid duplicate server names:

```powershell
codex mcp get dext --json
codex mcp remove dext
codex plugin add dext-codex-connector@dext-codex-connector
```

If plugin installation or startup fails, remove the plugin and recreate the saved raw MCP registration. Do not delete the versioned legacy adapter until rollback is no longer needed.

## Local development

The committed runtime is generated from `src/plugin/stdio.ts` and its fixture dependency factory:

```powershell
pnpm install --frozen-lockfile
pnpm build:plugin
pnpm check:plugin
pnpm test:integration
```

The bundle is committed because Codex marketplace installation does not run project dependency or build hooks. CI regenerates it and rejects stale output.
