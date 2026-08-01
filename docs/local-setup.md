# Local connector setup

The Codex plugin runs a read-only MCP server on your computer. It does not use the Dext website session in Chrome or another browser.

## 1. Choose the Dext module

Dext Data Health provides client health and activity data through `https://api.precision.dext.com/`. Eligible users can create a personal API token under `Practice settings > Data Health > API tokens`.

Dext Commerce uses a separate API and API key. Add it only if your Dext Commerce account provides developer access. Commerce invoice tools read invoice and bill transaction metadata. A Data Health token cannot authorize Commerce, and neither credential provides Dext Prepare invoice access.

Use a dedicated token for this connector. Choose the narrowest access Dext offers and record who owns the token.

## 2. Install the prerequisites

- Node.js 24.x
- Codex with plugin support
- Git, if you want to run the Windows setup helper from a checkout

Check the runtime:

```powershell
node --version
codex plugin --help
```

## 3. Store credentials on Windows

Clone the repository and run:

```powershell
git clone https://github.com/bidule995/dext-codex-connector.git
Set-Location dext-codex-connector
.\scripts\configure-local.ps1
```

PowerShell masks the prompt. `ConvertFrom-SecureString` encrypts the value with Windows DPAPI for the current Windows user. The helper writes:

```text
%LOCALAPPDATA%\dext-codex-connector\config.json
%LOCALAPPDATA%\dext-codex-connector\credentials.dpapi.json
```

The first file contains mode and module flags. The second contains DPAPI ciphertext. The helper limits directory access to the current user and does not call Dext.

Add Commerce during setup with:

```powershell
.\scripts\configure-local.ps1 -EnableCommerce -CommerceEnvironment sandbox
```

Use the Commerce sandbox until you have reviewed its payloads and account scope. Production Commerce requires `-CommerceEnvironment production` and a separate key.

Inspect presence without decrypting or printing the values:

```powershell
.\scripts\show-local-status.ps1
```

## 4. Portable environment setup

macOS and Linux users can pass credentials through the environment. A password manager or OS secret launcher should set the variables before Codex starts:

```text
DEXT_CONNECTOR_MODE=live
DEXT_DATA_HEALTH_ENABLED=true
DEXT_DATA_HEALTH_TOKEN=<dedicated Data Health token>
```

Optional Commerce variables:

```text
DEXT_COMMERCE_ENABLED=true
DEXT_COMMERCE_API_KEY=<separate Commerce API key>
DEXT_COMMERCE_ENVIRONMENT=sandbox
```

The plugin manifest forwards only its documented `DEXT_*` allowlist. Environment variables override the config file. Avoid shell history, `.env` files in the repository, screenshots, and Codex prompts when setting a credential.

`DEXT_LOCAL_CONFIG_PATH` can point to another JSON config file. `DEXT_RISK_DETAIL_REQUEST_BUDGET` accepts 1 through 50 and defaults to 40.

## 5. Install the plugin

```powershell
codex plugin marketplace add bidule995/dext-codex-connector
codex plugin add dext-codex-connector@dext-codex-connector
```

If the marketplace already exists, refresh it:

```powershell
codex plugin marketplace upgrade dext-codex-connector
```

Start a new Codex task after installation or configuration changes.

## 6. Verify before reading client data

Ask Codex:

```text
Check my Dext connection status. Do not fetch client or invoice data.
```

For Data Health, confirm:

- `providerMode` is `live`.
- `modules.dataHealth.configured` and `connected` are `true`.
- `credentialSource` is `windows-dpapi` or `environment`.
- The response contains no token value.

`connection_status` performs no Dext request. Your first `list_clients` call sends a read-only `GET /clients` request to Dext. Use a narrow request first:

```text
List up to five Dext Data Health clients and return names, health scores, and alert levels only.
```

Commerce users can ask for a small invoice page after its module reports configured:

```text
List up to five Dext Commerce sales invoices. Return reference, date, currency, and total only.
```

## Network destinations

The local bundle allows these provider hosts:

| Module | Environment | Host |
| --- | --- | --- |
| Data Health | Production | `api.precision.dext.com` |
| Commerce | Sandbox | `sandbox-api.greenback.com` |
| Commerce | Production | `api.greenback.com` |

The provider sends bearer credentials only to the selected exact HTTPS host. Tests inject mock transports and block external network access.

## Rotation

Create a replacement token in Dext, rerun `configure-local.ps1`, and start a new Codex task. Test `connection_status`, then make one small read. Revoke the old token in Dext after the new token works.

The setup helper replaces local ciphertext. It does not revoke the old upstream token.

## Disable or remove

Set `mode` to `disabled` in `config.json` to keep the encrypted credential while disabling tools. Remove the plugin with:

```powershell
codex plugin remove dext-codex-connector@dext-codex-connector
```

Remove the local config and protected credentials with:

```powershell
.\scripts\remove-local-credentials.ps1
```

The removal helper asks for confirmation and deletes only the local connector directory. Revoke the token in Dext to end its upstream validity.

## Troubleshooting

### `providerMode` is `disabled`

Run `show-local-status.ps1`, confirm `mode` is `live`, and start a new Codex task. A task that started before configuration keeps its original MCP process.

### Windows cannot decrypt the credential

DPAPI binds the ciphertext to the Windows user that created it. Run `configure-local.ps1` under the same account. Recreate the protected file after moving to another computer or Windows profile.

### Dext rejects the token

Confirm that you created a Data Health API token, not a browser cookie or Commerce key. Check the token's account scope and expiry in Dext. Revoke a token if you suspect exposure.

### Invoice tools do not appear

Invoice tools require a Dext Commerce API key and `commerce.enabled: true`. Data Health and Dext Prepare credentials do not enable them.

### Duplicate `dext` tools

Remove any older global raw-MCP registration named `dext`, keep the plugin registration, and start a new task.
