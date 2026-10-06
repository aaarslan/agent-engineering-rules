# Stored-record and migration contract

The JSON file is an array of uniquely identified records. The old `archived`
field accepts booleans and the exact strings `"true"` and `"false"`. The new
`active` field accepts booleans. False archived means active. Other values are
invalid. Existing `active` is authoritative; a conflicting legacy field must not
overwrite it. Preserve IDs, user text and unknown fields.

1. Validate every row before any write. Invalid data leaves the original bytes
   unchanged and returns an error naming the bad record. Never coerce strings
   with generic truthiness.
2. The backfill is resumable: `afterWrite(index)` models process interruption
   after a completed write. A retry preserves already migrated values and
   converges to the same result as an uninterrupted run. It retains `archived`
   for old readers during the compatibility window; removal is a separate,
   explicitly approved retirement.
3. `readActive` supports both formats during deployment and rejects invalid
   values. New and old readers must retain the same meaning for every record.

Power-loss durability and concurrent writers are outside this fixture. Document
that limit rather than claiming a production database migration was exercised.
