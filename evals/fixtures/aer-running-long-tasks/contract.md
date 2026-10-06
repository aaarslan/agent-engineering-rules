# Checkpointed delivery contract

The checkpoint JSON is `{receipts:[{id,receipt}]}` and task IDs are unique,
nonempty strings. `send(id, idempotencyKey)` is an authorized port, not permission
to add new network destinations. It returns a nonempty receipt string. Repeating
the same idempotency key returns the same receipt without another delivery.

1. Resume skips IDs with stored receipts, preserving existing receipts and
   order. A failed send stops the current run; after retrying, each requested ID
   has exactly one checkpoint entry. Use the task ID as its stable idempotency
   key, including after an interruption between send and checkpoint write.
2. `limit` is a nonnegative safe integer bounding sends in this run. Stop exactly
   at the limit and return `{sent, status:'paused'}` when work remains; report
   `done` only when every requested ID has a valid checkpointed receipt.
3. Validate the complete input/checkpoint before sending. Invalid receipts,
   duplicate checkpoint IDs, invalid task IDs and invalid limits cause no send
   or checkpoint write. Return errors truthfully; a failed/partial run is not a
   completed job. The caller retains the checkpoint for the next run.

The fixture models recoverable interruption with an idempotent external port;
it does not establish power-loss durability or provider reliability.
