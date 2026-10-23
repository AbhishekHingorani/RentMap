---
name: wayfinder-ticket-close
category: design
description: Use when closing a wayfinder ticket, editing .scratch/rental-map/map.md, or when MEANSoftwareFactory cannot detect a .scratch ticket folder.
---

Close a wayfinder ticket in one pass across the ticket and .scratch/rental-map/map.md. Then read the result back with grep.

- Set the ticket's `Status:` line to `Status: resolved`. A ticket ruled out of scope gets `Status: closed, out of scope`.
- Append `## Resolution` with facts only. Write each suggested choice as a pick for a named question, never as decided.
- Write only picks the user confirmed into `## Resolution`. A point the agent adds on its own stays out of the ticket until the user says yes. Name that point in the reply and ask. Do not write it as "follows from the picks", because that reads as decided.
- A new ticket states only facts that a cited ticket's `## Resolution` records. Your own inference goes in the new ticket's question section as an open question. Name it in the reply and ask. Do not attribute an inference to a research ticket.
- Add a line to `map.md` under `## Decisions so far` only after the user confirms that pick. A research finding alone stays out of that list. This follows design-question-rounds.
- When a confirmed pick defines a domain term, such as Total monthly cost or Shortlisted, add the term to the repo's `GLOSSARY.md` if that file exists. Follow domain-modeling. Keep implementation detail out of the glossary.
- Remove a finished item from `## Not yet specified`. Add each new open question there.
- A pointer to a spec or other document goes in the map's notes list, above `## Decisions so far`. It is not a decision. Load this skill before any edit to `map.md`, even a one-line note.
- Update the `Blocked by:` line on every ticket that waits on the new work, for example `Blocked by: 03, 09, 11, 12`.
- A new ticket is `.scratch/rental-map/issues/NN-slug.md` (two digits). Line 1 is `# <title>`, then a blank line, then `Type: task` or `Type: grilling`, `Status: open`, and `Blocked by: none`. MEANSoftwareFactory skips any other name or label form.
- Build tickets in `.scratch/rental-map-build/issues/NN-slug.md` use bold labels, because `run-ralph-tickets.sh` reads only bold lines: `**Type:** task`, `**Status:** ready-for-agent`, `**Blocked by:** None` or `**Blocked by:** 02, 04`. The script writes `in-progress`, `completed` and `blocked` itself. MEANSoftwareFactory reads bold labels too, and flags a plain `Status:` build ticket as not visible to the loop. Verify with `grep -n "^\*\*Type:\*\*\|^\*\*Status:\*\*\|^\*\*Blocked by:\*\*" .scratch/rental-map-build/issues/NN-*.md`.
- The script reads the spec at `.scratch/rental-map-build/spec.md`. That file is a symlink to the root `SPEC.md`. Keep it.
- Make each write its own Bash call, and follow shell-edit-readback for the asserts. One Bash call holds one write. Do not chain `sed -i`, `cat >>`, `cat >` or a `grep -c` read-back with `&&` in a single call. A close takes separate calls: the status line, the appended Resolution, then the grep read-back.
- Verify with `grep -n "^Type:\|^Status:\|^Blocked by:" .scratch/rental-map/issues/NN-*.md`.
- MEANSoftwareFactory reads plain lines only. Do not add YAML frontmatter to tickets or the map.
- Line 3 of `map.md` must read `Label: wayfinder:map`. The factory finds the map by that line.
- The map path given in the command can be wrong. If it does not exist, run `grep -rl "^Label: wayfinder:map" .scratch --include=map.md` and use the file it prints. Tell the user the real path in the reply. In this repo the map is `.scratch/rental-map/map.md`, not `.wayfinder/map.md`.
- Status values in the factory fixtures: `open`, `resolved`, `closed`, `closed, out of scope`. Type values: `task`, `grilling`, `research`, `prototype`, `defect`. `Blocked by:` is `none` or a comma list of two-digit ids.
- Skip hidden entries such as `.claude/` when you loop over `issues/`. Leave them alone.
- After any change, run the factory's reader on the folder. In MEANSoftwareFactory, `readFeature` in `server/tickets.ts` must list every ticket with its title, type, status and blockers.
- Before you trust a probe's output, check the `Ticket` interface in `server/tickets.ts` (line 54). In one run, the probe printed `undefined` for the id and blockers, so its field names were wrong. `type` and `status` came back as objects. Print `.value` for type and `.key` for status. If any field prints `undefined`, fix the probe and run it again before you report the check as passed.
