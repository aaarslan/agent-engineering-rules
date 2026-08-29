# Performance

Correct and clear first. Performance work requires measurement under the universal contract; a violated requirement makes the fix a correctness matter, not speculative optimization.

## Rules

- No premature optimization. Do not complicate code for speed without a measurement showing the cost and a requirement it violates.
- Measure before and after. An optimization without a benchmark, profile, or production metric is a guess; report the numbers.
- Fix the algorithm and the I/O pattern before micro-tuning. Eliminating an O(n²) loop or a query-per-item beats any amount of caching cleverness.

## Cheap habits that are always worth it

These are not premature optimization; they are avoiding known pathologies:

- No N+1 queries: batch or join instead of querying inside a loop.
- No unbounded work: bound every collection you return or process (paginate, cap, or stream).
- Do not fetch data you discard: select needed columns, filter at the source.
- Keep heavy work off hot paths (request handling, render loops, interrupt handlers): precompute, defer, or batch when the repo has a place for it.

## Caching

Cache only with evidence of a hot, expensive, repeatable read, and answer invalidation before adding it. A stale cache is a correctness bug wearing a performance costume.

## Checklist

- [ ] Is there a measurement motivating this change? Cite it.
- [ ] Does the data access pattern scale with realistic input sizes?
- [ ] Did the optimization preserve behavior, verified by tests?
