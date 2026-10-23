# Wayfinder tracker (local markdown)

- `map.md` is the map. Line 3 is `Label: wayfinder:map`.
- `issues/NN-slug.md` is one child ticket. The two digits are its id.
- Each ticket starts with this block:

  ```
  # <title>

  Type: research | prototype | grilling | task
  Status: open | claimed | resolved | closed, out of scope
  Blocked by: 03, 09 (or none)
  ```

- `claimed` means a session is working on it. A ticket is unblocked when every ticket in `Blocked by` is `resolved`.
- Frontier: tickets with `Status: open` whose blockers are all `resolved`. First by number wins.
- A resolution goes in a `## Resolution` section at the end of the ticket.
- Research findings go in `research/<name>.md`. There are no research branches.
- MEANSoftwareFactory reads this format (`server/tickets.ts`). Keep the two-digit names and the capital `Status:` and `Blocked by:` labels.
