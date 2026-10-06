---
name: "aer-securing-code"
description: "Implement protections when the changed code crosses an authorization, input, secret or external-effect boundary. Exclude unrelated security audits."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# Securing Code

Trace affected trust boundaries and inputs to authorization decisions and side effects. Protect secrets and sensitive output, reject invalid inputs, bound retries/timeouts and use repository-native controls. Exercise permitted and denied paths and failure behavior; secure implementation does not authorize an unrelated audit.

Load relevant local detail only:
- [security](references/security.md)
