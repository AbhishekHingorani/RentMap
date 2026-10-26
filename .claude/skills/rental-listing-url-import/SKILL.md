---
name: rental-listing-url-import
description: Use when importing housing.com URLs into the rental sheet.
category: parsing
---

# Rental listing URL import

Read each listing page in its own browser step. Send the picks to the local receiver. Dry-run the import, and only then run it with `--write`.

## Steps

1. Open each URL from `Urls.txt` in one tab. Navigate in one call. Run the reader script in the next call. Never chain the two in one `browser_batch`. The reader is `templates/pick-housing-listing.js`.
2. If the reader returns "other listing" or "no listing", report that URL and do not import it.
3. Keep the picks in the scratchpad `picks` folder. Run `import-housing.mjs` on that folder without a write flag first.
4. Read the dry run. ADD adds a row. OVERWRITE changes only Listed by, Broker name, and Other details. Ratings, notes, and status stay. Tell the user about every OVERWRITE.
5. Run the same command with `--write`.
6. Check the sheet with the Apps Script `load` action. Every URL id must have a row, and every row must have a Lat value.
7. Stop the receiver with `pkill -f "node receiver.js"` before the import. The "exit 144" background notice is that kill, not a failure.
8. Report the counts: added, overwritten, rows with no building name ("?"), and same-name listings with different ids. Tell the user to reload the map page.
