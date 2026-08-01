# Codex plugin lifecycle

The repository root is a Codex plugin and a Codex marketplace. `.mcp.json` launches the committed `plugin/runtime/dext-local-stdio.mjs` bundle with Node.js 24. Codex does not need the source checkout or `node_modules` after installation.

## Install

Configure the credential before or after installation by following [Local setup](local-setup.md). Then run:

```powershell
codex plugin marketplace add bidule995/dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

Start a new Codex task. Plugin changes do not alter a task that already loaded its MCP servers.

## Upgrade

Refresh the marketplace snapshot, reinstall the plugin, and start a new task:

```powershell
codex plugin marketplace upgrade dext-codex-connector
codex plugin remove dext-codex-connector@dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

The credential lives outside the Codex plugin cache, so reinstalling does not copy or erase it.

## Uninstall

```powershell
codex plugin remove dext-codex-connector@dext-codex-connector
```

Removing the plugin stops its MCP child process when the task closes. The process holds snapshots, audit metadata, and record links in memory, so they disappear on exit. The local credential remains until you run the removal helper.

## Namespace migration and rollback

Codex should load one `dext` MCP namespace. Record any older raw `codex mcp` registration before removing it. Remove that registration before installing this plugin to prevent duplicate tool names.

To roll back, remove the current plugin and install the prior prerelease from the marketplace snapshot that contains it. Keep the credential file unless you intend to disconnect. Rollback does not change data in Dext.

## Maintainer checks

The marketplace release includes a generated ESM bundle. Rebuild and validate it after changing local runtime code:

```powershell
pnpm build:plugin
pnpm check:plugin
pnpm release:verify-local
```

`pnpm check:plugin` fails when the generated bundle differs from the committed artifact. The official plugin validator must also pass before release.
