# Security

The universal contract makes touched security obligations non-negotiable. No task instruction silently overrides them.

## Non-negotiables

- Validate the shape, type, and limits of untrusted input at system boundaries: requests, files, environment, third-party responses, queue messages. Preserve contractual data; normalize or sanitize only when the contract requires it, and apply context-specific encoding, escaping, or parameterization at each sink.
- Authentication answers "who are you"; authorization answers "may you do this". Treat them as separate concerns and enforce authorization in the trusted layer (server-side, in client-server systems) on every operation that needs it. Checks in untrusted clients are UX, not security.
- Use parameterized queries. Never interpolate untrusted data into SQL, shell commands, or eval-like sinks.
- Treat HTML as a context-specific sink. Browser DOM rendering is owned by [Web UI](web-ui.md); never hand-roll an escaper, because incomplete entity or attribute handling creates injection sinks.
- Never hardcode secrets, keys, or tokens. Never log secrets, credentials, tokens, or sensitive personal data. Check what error messages and stack traces leak.
- Apply least privilege: scopes, DB roles, file permissions, API keys as narrow as the task allows.
- Deny by default. New endpoints, routes, and resources start protected; opting out is the explicit act.

## Review lens

When reviewing or auditing, check for:

- [ ] Injection sinks reachable from untrusted input
- [ ] Missing or client-only authorization on any state-changing operation
- [ ] IDs from the client used without ownership checks (object-level authorization)
- [ ] Secrets in code, config, logs, or error output
- [ ] Unsafe deserialization or unvalidated redirects and file paths
- [ ] Dependencies added without need, or with known vulnerabilities
- [ ] Unsafe external interactions: missing TLS, unverified webhooks, over-trusted third-party data

Report suspected vulnerabilities in existing code even when out of scope; do not silently fix or ignore them.
