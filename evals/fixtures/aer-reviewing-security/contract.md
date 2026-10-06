# Acceptance contract

Read-only review of app.mjs. Actors are authenticated upstream but may access invoices only in their workspace. downloadPath must resolve only relative paths inside root; traversal and absolute paths are unsupported. refreshSession may extend only an unexpired authenticated session; expired sessions require reauthentication. Inspect these boundaries and callers available in the fixture, report reachable abuse and bounded remediation, and separate known local behavior from unavailable deployment evidence. Do not modify app.mjs or claim exhaustive coverage.
