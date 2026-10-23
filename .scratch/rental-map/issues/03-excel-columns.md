# Pick the sheet columns

Type: grilling
Status: resolved
Blocked by: 02

## Question

What is the final column list for the shared Google Sheet? Start from the sample sheet. Check the user's list: configuration (BHK), rent, carpet area, furnishing (furnished, semi-furnished, unfurnished), floor, locality, reviews, notes, pros, cons, broker phone, owner phone, shortlisted. The app also needs: source link, lat, long, pin precision (building, society, locality), photo links (Google Drive), date added, added by. Claude web also returned these from a real listing (`samples/claude-web-reply.txt`): deposit, brokerage, dealer or owner listing, bathrooms, balconies, super built-up area, furnishing items, total floors, facing, parking, power backup, available from. Decide which of these become columns. For each column: its name, its type, and who fills it (Claude from the link, or the user).

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q26).

**Sheet layout.** Three tabs. Headers in row 1. No formulas: the app works out every computed value and writes plain values. The old Shortlist Comparison tab is dropped. The budget limit moves from cell B1 to the Settings tab.

**Tracker tab** (one row per listing)

| # | Column | Type | Who fills it |
|---|---|---|---|
| 1 | Listing id | text | app |
| 2 | Society / building name | text | Claude |
| 3 | Locality | text | Claude |
| 4 | Configuration | 1RK, 1BHK, 2BHK, 3BHK, 4BHK+ | Claude |
| 5 | Status | To call, Visit scheduled, Visited, Shortlisted, Rejected | person; new listings start as To call |
| 6 | Listed by | Owner, Dealer | Claude |
| 7 | Broker name | text | Claude |
| 8 | Broker phone | text | person (sites hide phone numbers) |
| 9 | Owner name | text | person |
| 10 | Owner phone | text | person |
| 11 | Rent (₹/month) | number | Claude |
| 12 | Maintenance (₹/month) | number | Claude |
| 13 | Total monthly cost | number | app: rent + maintenance |
| 14 | Deposit | number | Claude |
| 15 | Brokerage fee | number | Claude |
| 16 | Carpet area (sq ft) | number | Claude; may be empty |
| 17 | Super built-up area (sq ft) | number | Claude; may be empty |
| 18 | Bathrooms | number | Claude |
| 19 | Floor / total floors | text, like "4 of 4" | Claude |
| 20 | Furnishing | Unfurnished, Semi-furnished, Fully furnished | Claude |
| 21 | Parking | Yes, No | Claude |
| 22 | Lift | Yes, No | Claude |
| 23 | Available from | text | Claude |
| 24 | Other details | text: facts with no column (facing, balconies, power backup, furnishing items) | Claude |
| 25-29 | Safety, Water supply, Location, Condition, Natural light | 1 to 5 | person; Claude leaves them empty |
| 30 | Overall rating | number | app: average of 25 to 29 |
| 31 | Pros | text, split by ";" | person |
| 32 | Cons | text, split by ";" | person |
| 33 | Notes | text | person; the app adds name and date before each note |
| 34 | Photos | image links (Drive or site), split by ";" | Claude or person |
| 35 | Listing link | URL | app |
| 36-37 | Lat, Long | number | app, from the page or the address; a person can drag the pin |
| 38 | Pin precision | building, society, locality | app |
| 39 | Date added | date | app |
| 40 | Added by | text | app |

**Places tab** (important places, shared by all): Name, Address, Lat, Long, Pin precision, Added by. A person adds a place in the app by name and address. The app finds its map spot.

**Settings tab:** Budget (₹/month).

**Other picks**
- Shortlisted is a Status value. There is no separate flag.
- One shared set of ratings per listing, not one per person.
- A listing's review is its Overall rating.
- The old "Distance from workplace" column is dropped. The app shows the straight-line distance from the listing to each place, live, and stores nothing.
- There is no Google login. The app asks each person's name once, remembers it on that computer, and uses it for Added by and Notes.
- Whether site photos get copied into Drive is left to [Decide the add-by-link flow](07-add-by-link-flow.md).
