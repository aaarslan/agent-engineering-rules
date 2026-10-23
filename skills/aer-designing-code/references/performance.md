<!-- Generated from source/shared/performance.md by tools/render-v6.mjs -->
# Performance

Correct and clear first. Performance claims require a baseline and measured comparison; a violated requirement makes the fix a correctness matter, not speculative optimization.

## Rules

- No premature optimization. Do not complicate code for speed without a measurement showing the cost and a requirement it violates.
- Measure before and after. An optimization without a benchmark, profile, or production metric is a guess; report the numbers.
- Fix the algorithm and the I/O pattern before micro-tuning. Choose algorithm and I/O changes against the measured bottleneck before adding caching complexity.

## Resource and access patterns

Choose patterns according to the engine, workload and contract:

- Avoid costly query-per-item round trips; batch or join when beneficial. Many small in-process SQLite queries can be appropriate. Measure the actual engine and workload.
- Bound resource exposure with limits, pagination, batching or streaming as the contract permits. Preserve complete requested results; never silently truncate to satisfy a size rule.
- Do not fetch data you discard: select needed columns, filter at the source.
- Keep heavy work off hot paths (request handling, render loops, interrupt handlers): precompute, defer, or batch when the repo has a place for it.

## Caching

Cache only with evidence of a hot, expensive, repeatable read, and answer invalidation before adding it. A stale cache is a correctness bug wearing a performance costume.

## Checklist

- [ ] Is there a measurement motivating this change? Cite it.
- [ ] Does the data access pattern scale with realistic input sizes?
- [ ] Did the optimization preserve behavior, verified by tests?
