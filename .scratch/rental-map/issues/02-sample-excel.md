# Add the sample Excel sheet

Type: task
Status: resolved
Blocked by: none

## Question

The user puts their sample Excel sheet in `/Users/abhishekhingorani/Abhishek/rentalSelector/`. The resolution records the file name, sheet names, and every column header.

## Resolution

File: `Apartment Hunt.xlsx` (project root). Two sheets.

**Apartment Tracker**
- B1 holds a monthly budget limit (30000). "Total monthly cost" turns red above it.
- Headers in row 2, data in rows 3 to 62 (16 rows have data; most listings are in Ahmedabad: Shela, Vejalpur, South Bopal, Vaishnodevi).
- Columns A to AB: Society / building name, Location / area, Apartment type, Status, Broker name, Broker contact, Rent (₹/month), Maintenance (₹/month), Total monthly cost (₹), Deposit (₹), Brokerage fee (₹), Area (sq ft), Floor / total floors, Furnishing, Parking, Lift, Available from, Distance from workplace (km), Safety (1-5), Water supply (1-5), Location (1-5), Condition (1-5), Natural light (1-5), Overall rating (1-5), Pros, Cons, Photos link, Shortlist # (auto).
- Formulas: Total monthly cost = Rent + Maintenance. Overall rating = average of the 5 ratings. Shortlist # counts rows with Status "Shortlisted".
- Dropdowns: Apartment type (2BHK, 3BHK). Status (To call, Visit scheduled, Visited, Shortlisted, Rejected). Furnishing (Unfurnished, Semi-furnished, Fully furnished). Parking and Lift (Yes, No). Ratings must be 1 to 5.
- Status has conditional colors. The source listing link is stored as a hyperlink on the society name cell (2 rows have one, both 99acres).
- Pros and cons are one text cell each, items split by ";".
- "Available from" is free text (example: "20th October").
- Many rows are "To ask" with only a broker name and phone.

**Shortlist Comparison**
- Side by side view of up to 8 rows with Status "Shortlisted", all by formula. Rows are the tracker columns.

Not in the sheet but asked for by the user at charting: owner contact, notes, reviews, lat/long. Shortlisting is a Status value, not a separate flag.
