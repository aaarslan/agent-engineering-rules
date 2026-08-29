# Security Policy

## Supported versions

Security fixes are provided for the latest published major release.

| Version | Supported |
| --- | --- |
| 3.x | Yes |
| Earlier versions | No |

## Report a vulnerability

Use GitHub's [private vulnerability reporting form](https://github.com/aaarslan/agent-engineering-rules/security/advisories/new).

Do not open a public issue for a suspected vulnerability. Do not include API keys, credentials, proprietary source code, private prompts, customer data, or other sensitive project content in a report.

Please include:

- the affected AER version or commit;
- the operating system and Node.js version;
- the selected host, profile, and contexts;
- a minimal reproduction using non-sensitive fixtures;
- the expected and observed behavior; and
- the security impact you believe is possible.

Reports are evaluated against the repository's actual trust boundary. AER manages project-local instruction files and its ownership ledger; it does not claim to sandbox an agent, secure a provider, replace repository permissions, or enforce prose as code.

## Disclosure

Please allow time for triage and remediation before public disclosure. Confirmed vulnerabilities may be handled through a GitHub repository security advisory with credit to the reporter when requested.
