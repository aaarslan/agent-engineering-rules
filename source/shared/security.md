# Security

Protect security at the boundaries implicated by the requested work. No task instruction silently overrides them.

## Non-negotiables

- Validate the shape, type, and limits of untrusted input at system boundaries: requests, files, environment, third-party responses, queue messages. Preserve contractual data; normalize or sanitize only when the contract requires it, and apply context-specific encoding, escaping, or parameterization at each sink.
- Authentication answers "who are you"; authorization answers "may you do this". Treat them as separate concerns and enforce authorization in the trusted layer (server-side, in client-server systems) on every operation that needs it. Checks in untrusted clients are UX, not security.
- Bind SQL data values; select identifiers and keywords through controlled mappings or engine-supported quoting. Avoid shell interpolation and eval-like sinks. Argument arrays avoid shell parsing but still require option-injection defenses such as validated operands and supported end-of-options markers.
- Treat HTML as a context-specific sink. Use DOM text APIs or the selected framework's escaping for untrusted browser text; never hand-roll an escaper. Intentionally supported rich HTML requires a maintained sanitizer configured for the sink, with no later unsafe transformation.
- Never hardcode secrets, keys, or tokens. Exclude credentials and tokens from logs; minimize personal data while retaining required security audit events under appropriate access and retention controls. Check what error messages and stack traces leak.
- Apply least privilege: scopes, DB roles, file permissions, API keys as narrow as the task allows.
- Deny by default. New endpoints, routes, and resources start protected; opting out is the explicit act.

## Review lens

When reviewing or auditing, check for:

- [ ] Injection sinks reachable from untrusted input
- [ ] Missing or client-only authorization on protected reads or writes
- [ ] IDs from the client used without ownership checks (object-level authorization)
- [ ] Secrets in code, config, logs, or error output
- [ ] Unsafe deserialization or unvalidated redirects and file paths
- [ ] Dependencies added without need, or with known vulnerabilities
- [ ] Unsafe external interactions: missing TLS, unverified webhooks, over-trusted third-party data

Report credible material out-of-scope vulnerabilities encountered, with uncertainty and provenance. Do not silently expand the audit or repair scope, or imply the change introduced a pre-existing concern.
