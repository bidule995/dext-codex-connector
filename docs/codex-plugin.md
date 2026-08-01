# Codex plugin installation and lifecycle

The Codex plugin is the installable distribution unit. Its tools come from an MCP server. There are two deliberately separate distributions during the `0.2.0-beta.1` transition:

- The checked-in development plugin still launches the self-contained fictional stdio server. It cannot contact Dext and remains the safe rollback path.
- The release plugin will use the authenticated hosted HTTPS `/mcp` service. The release workflow refuses to publish it until `.mcp.json` contains a real deployed URL.

The fixture runtime is not a live fallback. Once the plugin is prepared for hosting, `.mcp.json` contains only `dext.url`; release archives exclude the stdio runtime and Node.js is no longer a user prerequisite.

## Current safe development install

The repository checkout currently uses three fictional companies, a fictional tenant and user, and process-local audit, snapshot, and permalink stores. Data disappears when the MCP process stops.

```powershell
codex plugin marketplace add bidule995/dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

Start a new Codex task. Until a hosted `0.2` prerelease is announced, `connection_status` must report fixture mode and Commerce must be unavailable. Do not provide Dext credentials in prompts or local plugin configuration.

## Hosted release acceptance

After the repository maintainer deploys the service, configures OAuth, provisions an isolated test identity, and runs `plugin:prepare-hosted`, a clean install must:

- complete OAuth against the registered authorization server;
- load exactly one `dext` MCP namespace;
- report live mode with no fictional companies;
- show only the current user's redacted connection status;
- run `search`, `fetch`, and Data Health reads against the explicitly connected isolated tenant;
- expose Commerce invoice reads only if the sandbox release gate passed;
- stop cleanly when removed, without a local child server or persistent plugin data.

The hosted service requires no Node.js installation on the Codex user's computer.

## Upgrade and uninstall

Refresh the marketplace, reinstall the plugin, and start a new task:

```powershell
codex plugin marketplace upgrade dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

Uninstall with:

```powershell
codex plugin remove dext-codex-connector@dext-codex-connector
```

Uninstalling removes the Codex plugin registration. It does not delete hosted encrypted connections. Disconnect those separately through the authenticated connection API if requested.

## Migration and rollback

Preserve the current raw-MCP or fixture-plugin configuration before replacing it. Remove any global raw MCP named `dext` immediately before installing the hosted plugin so only one namespace is active. If OAuth, startup, or acceptance fails, remove the hosted plugin and reinstall the last fixture prerelease. Do not delete credentials or account data as part of rollback.

## Maintainer workflow

The committed fixture runtime remains generated from `src/plugin/stdio.ts` and is checked for deterministic synchronization during development:

```powershell
pnpm build:plugin
pnpm check:plugin
```

After a real deployment passes acceptance, convert the manifest and prove the release gate:

```powershell
pnpm plugin:prepare-hosted -- --url https://<real-host>/mcp
pnpm check:plugin
pnpm release:verify-hosted
```

See `docs/hosted-deployment.md`, `docs/connection-api.md`, and `docs/provider-validation.md` for the external gates that must be real rather than simulated.
