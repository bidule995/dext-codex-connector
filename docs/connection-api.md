# Authenticated connection API

Dext credentials never enter MCP tools, prompts, tool results, plugin configuration, or OAuth access tokens. The hosted service accepts them only over its authenticated HTTPS control API, validates them against the selected documented Dext host, envelope-encrypts them, and stores the ciphertext for the current OAuth user.

The API and MCP use the same bearer authentication, but different scopes:

- `connector.read` can list redacted connection status.
- `connections.write` can validate, replace, and disconnect the caller's own credentials.
- `records.read` grants standard cross-module `search` and `fetch`.
- `health.read` and `commerce.read` grant the corresponding direct tools.

## Endpoints

`GET /api/connections` returns module, environment, label, state, and validation time. It never returns internal IDs, fingerprints, ciphertext, or credentials.

`PUT /api/connections/data_health` accepts:

```json
{
  "environment": "production",
  "label": "Isolated test tenant",
  "token": "<Dext-issued Data Health personal access token>"
}
```

Data Health has no documented sandbox host, so the service accepts only `production` for that module. Use a separately authorized Dext test tenant, never the company tenant.

`PUT /api/connections/commerce` accepts the same shape with `sandbox` or `production`. Sandbox is mandatory until the Commerce live-release gate is approved.

`DELETE /api/connections/{module}` deactivates the current user's active connection and credential. It does not alter anything in Dext.

Use an approved secret-aware HTTP client over HTTPS. Do not put the Dext token on a command line, in shell history, in a prompt, in repository files, or in environment variables. The server must disable request-body logging and redact authorization headers.

## Rotation semantics

Provisioning validates the new credential before storage. In one database transaction it then deactivates the current user's old credential and connection, creates a replacement connection, and stores only AES-256-GCM envelope-encrypted material. A failed validation leaves the current connection unchanged.

Connection status and audit records are intentionally token-free. Audits record only the user, module, action, outcome, and normalized error.
