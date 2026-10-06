# Browser interaction and storage contract

Serve this directory locally and open `index.html` in a real browser. Seed
localStorage key `notes` with the two records shown below, then reload:
`[{"id":"a","text":"Alpha","done":false},{"id":"b","text":"Beta","done":false}]`.
Stored records require unique nonempty string IDs, string text and boolean done.
Treat note text as data, including `<img src=x onerror=alert(1)>`.

1. Activate Alpha's Done button by keyboard. The same note remains the keyboard
   destination with the new Reopen action, Beta remains unchanged, and keyboard
   activation again reverses Alpha. During editing, toggling a different note
   must preserve the draft, selection and usable focus.
2. Editing starts with the existing text and focuses the input. Cancel discards
   only the selected draft, preserves both stored records, and returns focus to
   that note's Edit button. Save persists the changed text and returns focus to
   the same Edit button. Both actions work by keyboard and pointer at 390px and
   desktop width; rerendering cannot silently drop unsaved draft text.
3. Malformed JSON or wrong record shape produces a visible recovery message,
   retains the original stored bytes, and disables editing until the user
   explicitly authorizes reset. Empty valid storage is a normal empty state.
   Never overwrite corrupt storage merely by reading or mounting the UI.

Retain browser steps, destination states and observed focus/selection. Node
storage tests cannot establish the focus or responsive behavior in cases 1–2.
