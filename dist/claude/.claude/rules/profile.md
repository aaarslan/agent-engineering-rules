<!-- Active profile: standard. Change it with aer update --profile; do not edit this managed file for a normal profile switch. -->

# Standard Profile

Use this default when behavior or stored state is expected to be maintained or extended.

- Preserve public behavior and stored-data compatibility unless the task changes them.
- Keep changes localized but complete across affected callers, contracts, generated artifacts, and documentation.
- Exercise the real changed flow and relevant failure path. Add targeted tests after behavior stabilizes and run applicable repository gates.
- Run broad suites only for cross-cutting changes or repository-defined completion gates.

Report verified behavior, compatibility decisions, unavailable evidence, and remaining risk.
