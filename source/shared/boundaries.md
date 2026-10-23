# Architectural Boundaries

Keep business rules under clear ownership and follow sound framework-native repository conventions. A small handler or cohesive framework model can own a complete operation; do not create forwarding layers merely to keep entrypoints thin.

- Separate transport, policy and persistence when doing so improves comprehension, verification, ownership or independent change today.
- Enforce authorization and validation at the relevant trust boundaries. One authoritative rule may require enforcement in multiple places; do not remove storage integrity constraints or server checks to eliminate apparent duplication.
- Put external systems behind an interface when it isolates a real concern or improves testability or replaceability. Otherwise call them directly.
- Use dependency inversion where it serves a current boundary; framework and ORM types are not automatically a design defect.

Before adding a layer, name its responsibility and explain what becomes harder without it. Before merging responsibilities, check their lifecycles, authority and callers. Repeated policy edits across unrelated owners suggest drift; shared syntax alone does not justify abstraction.
