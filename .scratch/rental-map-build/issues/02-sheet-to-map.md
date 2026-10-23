# First thin path: sheet to map

Type: task
Status: open
Blocked by: 01

## What to build

The first path through every part. A person starts the app with one command and opens it in Chrome. The page loads the Google Sheet through the Apps Script and shows each listing as a card and a pin.

Spec: "Parts", "The sheet", "The Apps Script", "Screen > Layout" and "Screen > Pins" in SPEC.md.

## Acceptance criteria

- [ ] One command starts the local web server. The server serves the page on `http://localhost`.
- [ ] The Google Sheet has the Tracker, Places and Settings tabs, with the headers from the spec in row 1.
- [ ] The Apps Script is deployed. One call returns all 3 tabs.
- [ ] On first run, a popup asks for the person's name. The page keeps it on that computer.
- [ ] The list is on the left and the map is on the right. The map stays in view.
- [ ] Cards show photo, society, Status, locality, total cost, Configuration and Overall rating.
- [ ] The list is sorted by Total monthly cost, lowest first. A listing with no rent goes last.
- [ ] Money shows in Indian digit groups, like ₹1,17,000.
- [ ] Each pin shows total cost and Configuration, like "₹38k · 2BHK". Its color shows the Status.
- [ ] The map shows "© OpenStreetMap contributors".
- [ ] To test, put 2 or 3 rows with Lat and Long into the sheet by hand.

## Assumption

The owner said on 2026-10-23 to build on this assumption.

- **Start the app.** The command is `node server.js`. It starts the local web server and opens Chrome on `http://localhost:<port>`.

## Acceptance criteria for the assumption

- [ ] `node server.js` starts the server and opens the page in Chrome.
