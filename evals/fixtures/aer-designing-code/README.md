# aer-designing-code fixture

Copy this directory to a disposable workspace. `node --test baseline.test.mjs` checks its known starting behavior, including seeded failures where present; it is not task acceptance. The [contract](contract.md) discloses interfaces and required behavior. Third cases remain future development holdouts, not secret inputs. No network, credentials or production data are needed. Retain artifacts before removing the disposable copy.
