# aer-securing-code fixture

Copy this directory to a disposable workspace. `node --test baseline.test.mjs` checks its known starting behavior, including seeded failures where present; it is not task acceptance. The [contract](contract.md) discloses interfaces and required behavior. Third cases remain future development holdouts, not secret inputs. No network, credentials or production data are needed. Retain artifacts before removing the disposable copy.

`acceptance.test.mjs` contains disclosed boundary checks. Run only the selected
case with `node --test --test-name-pattern="^case-N:" acceptance.test.mjs`.
All three case checks intentionally fail on the unmodified seed. Their failure
is calibrated offline; it is not evidence of model performance. The baseline
test records seed behavior and is not a post-change success requirement.
