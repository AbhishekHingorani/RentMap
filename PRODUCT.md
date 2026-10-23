# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML, CSS and JavaScript. No framework. The map is OpenStreetMap with Leaflet. Each person starts a small local web server with one command and opens the page in Chrome. A Google Apps Script attached to one Google Sheet does all reads and writes. Source: `.scratch/rental-map/map.md`, Notes.

## Users

A small group, such as family or flatmates, who hunt for one rental home together in an Indian city (the sample listings are in Bangalore). Each person adds listings, rates them, writes notes, and moves them through the hunt. They use the app on a laptop, in Chrome, while they read listing sites like 99acres and housing.com in other tabs.

## Product Purpose

The app puts every listing the group looks at on one map, with what each person thinks of it. It replaces a hand-kept spreadsheet (`Apartment Hunt.xlsx`). Success: the group can see which homes fit the budget, how far each is from the places that matter, and which ones to visit or shortlist, without copying fields by hand.

## Positioning

A person pastes a listing link. Claude (on the web, or the person's own Claude Code) reads the listing and fills the fields. The person checks them and saves. All data stays in the group's own Google Sheet. No central server and no Google login.

## Operating Context

- A person finds a listing on 99acres or housing.com, copies its link, and adds it in the app. If Claude cannot read the page, a bookmarklet copies the page data instead.
- The group calls owners and brokers, books visits, and rates each home after a visit.
- Each listing moves through one Status: To call, Visit scheduled, Visited, Shortlisted, Rejected.
- The group sets important places, like an office or a school. The app shows the straight-line distance from each listing to each place.

## Capabilities and Constraints

- Screen layout: a list on the left and the map on the right. Details and the add steps open in the left column. See `.scratch/rental-map/issues/06-map-ui-prototype.md`.
- Columns, filters and the add-by-link flow are fixed in `.scratch/rental-map/issues/03-excel-columns.md`, `13-map-filters.md` and `07-add-by-link-flow.md`.
- Terms are defined in `GLOSSARY.md`: Listing, Status, Shortlisted, Configuration, Listed by, Rating, Overall rating, Place, Pin precision.
- Money is in rupees, shown in Indian digit groups (₹1,17,000).
- Laptop browser only. No phone layout. A phone app is out of scope.
- Undecided: duplicate listings, edit and delete after Save, two people editing at once, how others install the app. See "Not yet specified" in `.scratch/rental-map/map.md`.

## Evidence on Hand

- `Apartment Hunt.xlsx`: the user's real tracker sheet.
- `samples/`: one saved 99acres listing page and one real Claude web reply (`samples/claude-web-reply.txt`).
- No real photos of the users, no testimonials, no brand assets. Do not invent any.

## Product Principles

- The group decides. Claude fills fields, and a person checks them before anything is saved.
- Show the money and the distance first. These two settle most choices.
- One shared truth. Everyone reads and writes the same sheet, so the screen shows who added and wrote what.
- No guessing. A value the listing does not show stays empty and reads "not given".
