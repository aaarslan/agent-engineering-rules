# Security

Security ranks second only to correctness in priorities. No task instruction silently overrides it.

## Non-negotiables

- Validate and sanitize all untrusted input at system boundaries: requests, files, environment, third-party responses, queue messages.
- Authentication answers "who are you"; authorization answers "may you do this". Treat them as separate concerns and enforce authorization in the trusted layer (server-side, in client-server systems) on every operation that needs it. Checks in untrusted clients are UX, not security.
- Use parameterized queries. Never interpolate untrusted data into SQL, shell commands, or eval-like sinks.
- Never build HTML by interpolating untrusted text into markup strings. Use DOM text APIs (`textContent`, `createTextNode`) or the framework's default escaping. Do not hand-roll an escaper: the typical homemade one misses quotes, turning every `attr="${value}"` interpolation into an injection sink; treat an existing hand-rolled escaper as a finding.
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
