# HTTP and partner contract

Only `/records/:id` exists. `currentActor(request)` is a trusted authentication
port returning `{subject, workspace}` or null; headers supplied by the caller
are not identity. `records` contains `{id, workspace, quantity}` objects.

1. GET and POST require authentication (401); records belonging to another
   workspace are forbidden (403); absent records return 404. Unknown routes
   return 404 and unsupported methods return 405. JSON errors contain only an
   `error` string; no denied request returns record data or changes state.
2. POST accepts one JSON object containing only `quantity`, a positive safe
   integer <= 1000. Malformed JSON, unknown fields, arrays and invalid quantities
   return 400 without calling the partner or writing a record. Limit the request
   body to 1024 bytes, returning 413 before parsing larger bodies.
3. `partner.reserve(quantity)` returns `{ok:true, receiptId: nonempty string}`
   on success; thrown errors or any other result return 502. A failed reservation
   leaves the stored record unchanged. A successful response includes the new
   quantity and receiptId, never the raw partner object or internal error text.

Use real HTTP requests against a server bound to 127.0.0.1 on an ephemeral port.
Close the server after each test. No external network provider is required.
