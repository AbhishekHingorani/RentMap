# First thin path: sheet to map

**Type:** task
**Status:** in-progress
**Blocked by:** 01

## What to build

The first path through every part. A person starts the app with one command and opens it in Chrome. The page loads the Google Sheet through the Apps Script and shows each listing as a card and a pin.

Spec: "Parts", "The sheet", "The Apps Script", "Screen > Layout" and "Screen > Pins" in SPEC.md.

## Acceptance criteria

- [x] One command starts the local web server. The server serves the page on `http://localhost`.
- [ ] The Google Sheet has the Tracker, Places and Settings tabs, with the headers from the spec in row 1.
- [ ] The Apps Script is deployed. One call returns all 3 tabs.
- [x] On first run, a popup asks for the person's name. The page keeps it on that computer.
- [x] The list is on the left and the map is on the right. The map stays in view.
- [x] Cards show photo, society, Status, locality, total cost, Configuration and Overall rating.
- [x] The list is sorted by Total monthly cost, lowest first. A listing with no rent goes last.
- [x] Money shows in Indian digit groups, like ₹1,17,000.
- [x] Each pin shows total cost and Configuration, like "₹38k · 2BHK". Its color shows the Status.
- [x] The map shows "© OpenStreetMap contributors".
- [ ] To test, put 2 or 3 rows with Lat and Long into the sheet by hand.

## Assumption

The owner said on 2026-10-23 to build on this assumption.

- **Start the app.** The command is `node server.js`. It starts the local web server and opens Chrome on `http://localhost:<port>`.

## Acceptance criteria for the assumption

- [x] `node server.js` starts the server and opens the page in Chrome.

## Progress

Built on 2026-10-23. The 3 open boxes need the owner's Google account. The agent has no Google login.

- `node server.js` serves `public/` on `http://localhost:8790` and runs `open -a "Google Chrome"`. If that fails, it opens the default browser.
- `apps-script/Code.gs` has `setup`, which adds the 3 tabs with the spec headers in row 1, and a `load` action, which returns all 3 tabs in one call. `tests/apps-script.test.mjs` runs it against a fake sheet.
- The page reads the `/exec` URL from `config.json`, which is not in git. How other people get that URL is still a known gap in the spec.
- A headless Chromium run against a fake `/exec` showed the name popup, the 5 cards in cost order, the pins with Status colors, and "© OpenStreetMap contributors".
- A row typed by hand may have no Total monthly cost. The page then uses Rent plus Maintenance, the same rule the Max ₹/month filter uses.
- A Drive photo link does not show on the card yet. Ticket 10 adds the thumbnail URL.

Still open, for the owner. `README.md` lists the steps.

1. Make the sheet, paste `apps-script/Code.gs`, and run `setup`.
2. Deploy it as a web app with "Who has access" set to Anyone. Put the `/exec` URL in `config.json`.
3. Paste the 3 rows in `apps-script/test-rows.tsv` into Tracker cell A2, then run `node server.js`.
