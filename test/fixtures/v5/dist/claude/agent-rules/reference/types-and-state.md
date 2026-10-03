# Types and State

Make invalid states difficult or impossible to represent. The type system is the cheapest test suite you will ever write.

## Rules

- Use strong types instead of string conventions and loose objects. A `UserId` and an `OrderId` should not be interchangeable just because both are strings.
- Model mutually exclusive states as a discriminated union, enum, or explicit state machine. Never as a pile of booleans (`isLoading`, `isError`, `isSuccess`) that permits impossible combinations.
- Prefer clear domain models over generic bags of fields. A type named after a domain concept with exactly its required fields beats a generic string-keyed map or a struct of optionals.
- Make required data required. A field that is only optional because "sometimes we don't have it yet" usually indicates two distinct states that deserve two distinct types.
- Parse, don't validate: convert untrusted input into a well-typed value once at the boundary, then pass the typed value inward. Do not re-check the same invariant at every layer.
- Encode units and formats in names or types (`timeoutMs`, `amountCents`, `Iso8601Date`), never leave them implied.

## Checklist

- [ ] Can this type represent a state the business considers impossible? Restructure.
- [ ] Do two or more booleans encode one underlying state? Union them.
- [ ] Is a string carrying structure (IDs, enums, JSON)? Give it a type.
- [ ] Is `null`/`undefined` carrying meaning (not-found, failed, empty)? Name that meaning explicitly.
