# Acceptance contract

Three consumers duplicate one pricing rule: sum quantity*unitCents. Inputs are finite lists of nonnegative integer quantities and integer cents, already validated at the caller boundary. Empty lists total zero. Keep all three exports and their return shapes, currency, JSON key order and lack of side effects. Refactor pricing ownership without changing product behavior or adding dependencies. Structural improvement requires human inspection; unchanged output tests alone cannot establish it.
