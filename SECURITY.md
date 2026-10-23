# Security policy

6.1.0 is the final planned maintenance release, with public archival planned
after release verification. No ongoing maintenance, security fixes or support
are promised. V5 is retained only as a pinned exit and regression fixture. Report the exact installed package/revision and protocol
schema, runtime/platform, representation, selections and a sanitized reproduction.

While available, use GitHub's [private vulnerability reporting form](https://github.com/aaarslan/agent-engineering-rules/security/advisories/new).
Do not disclose credentials, private prompts, customer data or proprietary code
in public issues. Allow triage before public disclosure.

AER manages project-local files and a ledger. Its safety checks do not sandbox an
agent or a process controlling the same filesystem. Native invocation controls,
review tool restrictions, provider permissions and model compliance are distinct.
`packageMatch` is local consistency, not publisher authenticity. Installing a
skill makes executable resources available; nothing runs on discovery/install.
Review artifacts, pin versions and use the client's actual permission controls.
