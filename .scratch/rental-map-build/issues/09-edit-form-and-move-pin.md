# Edit form and move pin

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T13:40:05Z
**Blocked by:** 08

## What to build

A person fixes a Claude-filled field after Save, like a wrong rent. A person also drags a pin to the right spot. Both use the clash check from ticket 08.

Spec: "Edit a listing" (Edit button, Locked fields, Move pin) and "Two people edit one listing" in SPEC.md.

## Acceptance criteria

### Edit form

- [ ] The "All 40 fields" tab has an "Edit" button. It reads the row again, then makes the Claude-filled fields editable.
- [ ] These stay locked: Listing id, Listing link, Total monthly cost, Overall rating, Date added, Added by, Lat, Long, Pin precision.
- [ ] Save sends only the changed cells, each with the value the person saw.
- [ ] After a Rent or Maintenance save, the script writes the new Total monthly cost inside the same lock.
- [ ] On a refused save, the form stays open with what the person typed. Each clashing cell shows "In the sheet now: <value>" with "Use sheet value" and "Keep mine".
- [ ] The next Save sends the sheet value as the old value.
- [ ] An edit to Locality or Society does not move the pin.

### Move pin

- [ ] The "All 40 fields" tab has a "Move pin" button. It lets the person drag the pin.
- [ ] A drop saves the new Lat and Long.
- [ ] A refused drag puts the pin back on the sheet spot and shows a message. The app does not retry.
