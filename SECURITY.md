# Security policy

## Supported versions

This project is currently in beta. Security fixes are applied to the newest
prerelease only.

| Version | Supported |
| --- | --- |
| Latest beta | Yes |
| Older betas | No |

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not open a
public issue and do not include real Dext credentials, customer data, browser
cookies, passwords, two-factor codes, or authorization headers.

Include the affected version, impact, minimal reproduction using fictional
data, and any suggested mitigation. You should receive an acknowledgement
within seven days. Valid reports will be coordinated privately until a fix and
advisory are ready.

If you believe a live credential has been exposed, revoke it through the
appropriate provider immediately before reporting the connector issue.

The local Windows setup stores DPAPI ciphertext under
`%LOCALAPPDATA%\dext-codex-connector`. Do not attach those files to a report.
Use synthetic credentials and payloads in reproductions.
