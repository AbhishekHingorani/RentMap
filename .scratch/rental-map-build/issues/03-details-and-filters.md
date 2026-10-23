# Listing details and filters

Type: task
Status: open
Blocked by: 02

## What to build

A person clicks a card or a pin and reads every fact about that listing. A person also narrows the list and the map with the filter bar. Nothing here writes to the sheet.

Spec: "Screen > Listing details", "Screen > Filters" and "Screen > Pins" in SPEC.md.

## Acceptance criteria

### Details

- [ ] A click on a card or a pin opens the details in the left column, with a "Back to the list" link.
- [ ] The header shows society, locality, Status, total cost, Configuration, Overall rating and a link to the listing page.
- [ ] The header shows an "Over budget" tag when the total is above the Budget in the Settings tab.
- [ ] The tabs are Overview, Our take, Contacts and All 40 fields. In this ticket they only show values.
- [ ] All 40 fields lists every Tracker column with its number.
- [ ] A value the listing does not show reads "not given".
- [ ] When the picked listing's Pin precision is society or locality, a dashed circle shows around its pin.

### Filters

- [ ] Max ₹/month starts at the Budget. It checks Total monthly cost, or Rent alone when Maintenance is empty. A listing with no Rent passes.
- [ ] Configuration has one checkbox each for 1RK, 1BHK, 2BHK, 3BHK and 4BHK+. All are ticked at start.
- [ ] Shortlisted only is a switch, off at start.
- [ ] Show rejected is a switch, off at start. Rejected listings stay hidden until it is on.
- [ ] Search matches Society / building name and Locality. Case does not matter.
- [ ] A filtered-out listing leaves the list, and its pin leaves the map.
- [ ] The filter bar shows "N of M listings shown".
- [ ] Filters never go into the sheet. They reset each time the app opens.
