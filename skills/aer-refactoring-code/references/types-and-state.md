<!-- Generated from source/shared/types-and-state.md by tools/render-v6.mjs -->
# Types and State

Use types to expose important contracts and rule out invalid combinations where the language supports it. Runtime input, mutation and concurrency still need appropriate checks.

- Model mutually exclusive states explicitly when independent flags permit impossible combinations. Keep genuinely independent booleans independent.
- Use domain models, units in names, or wrappers when they prevent a concrete confusion. Ordinary strings, maps and optional fields are valid when their meaning is clear. TypeScript aliases alone do not create nominal separation.
- Parse untrusted input at the boundary and pass the validated result inward. Recheck an invariant when mutation, a new trust boundary or concurrent state can invalidate it; static types do not validate external bytes.
- Distinguish absent, not-found, empty and failed results when callers need different behavior. An explicit optional-result contract can be sufficient.
- Prefer the least complex representation that preserves the actual invariants. Introduce a state machine or branded type for a current benefit, not as a universal requirement.
