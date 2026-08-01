# Contributing

Thanks for helping improve the Dext Codex Connector. Keep changes small,
reviewable, and safe for multi-tenant accounting data.

## Development

Use Node.js 24 and pnpm 11.9.0:

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm check
```

Fixture mode is mandatory for normal development. Do not use a personal or
company Dext account, token, cookie, password, or two-factor code. Live contract
work requires a dedicated test tenant and the process in
[`docs/provider-validation.md`](docs/provider-validation.md).

## Pull requests

- Open an issue first for significant features, provider contracts, or security-sensitive changes.
- Use Conventional Commits and reference the issue, for example `fix(auth): #123 reject unmapped tenants`.
- Add or update tests for behavior changes.
- Run `pnpm check` and the static packaging test before opening the pull request.
- Treat schema changes as forward-only migrations; never rewrite an applied migration.
- Never commit `.env`, credentials, response payloads from real tenants, or customer identifiers.

Maintainers may require isolated PostgreSQL, Docker, MCP Inspector, Codex, or
ChatGPT validation depending on the affected boundary.

## Reporting security issues

Do not open a public issue for a vulnerability or suspected credential leak.
Follow [`SECURITY.md`](SECURITY.md) instead.
