# Observability

Someone will debug this at 3 a.m. Write for them.

## Rules

- Log decisions and state transitions, not narration. "Payment declined: card_expired, order=123" beats "entering processPayment".
- Every error log carries enough context to act: operation, relevant identifiers, the cause. Follow the repo's existing logger and structure (structured fields over string mashing where available).
- Choose levels deliberately: `error` means someone may need to act, `warn` means degraded but handled, `info` means notable state change, `debug` means development detail. An error level that fires routinely trains people to ignore it.
- Never log secrets, tokens, or sensitive personal data, and sanitize untrusted input before logging it (strip newlines and control characters — log injection is a measured top failure class of generated code). See [security](security.md).
- Instrument the boundaries that fail in production: external calls, queues, retries, timeouts. Record duration and outcome where the repo has metrics conventions.
- Do not add a metrics or tracing stack to a project that has none as a side effect of another task; propose it separately.

## Checklist

- [ ] Could an on-call engineer localize a failure in this code from its logs alone?
- [ ] Do error paths log the cause once, at the right level, without duplicate noise up the stack?
- [ ] Is anything sensitive leaking into logs or error messages?
