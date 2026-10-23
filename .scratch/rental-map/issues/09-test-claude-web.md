# Test Claude web with one listing link

Type: task
Status: resolved
Blocked by: none

## Question

Checklist for the user:
1. Open one 99acres rental listing in your browser.
2. Save the page: File, Save Page As, "Webpage, Complete". Save it in `/Users/abhishekhingorani/Abhishek/rentalSelector/samples/`.
3. Open claude.ai (free plan is fine). Paste: "Read this rental listing and list its rent, BHK, carpet area, furnishing, floor, locality, and photo links: <link>".
4. Copy Claude's full reply into `/Users/abhishekhingorani/Abhishek/rentalSelector/samples/claude-web-reply.txt`.
5. If you can, repeat steps 1 to 4 for one housing.com listing.

The resolution records whether Claude web read the page, and which fields came back.

## Resolution

Claude web (claude.ai) read the 99acres listing from the link alone. It returned rent, deposit, brokerage, BHK, bathrooms, balconies, super built-up area, furnishing items, floor, locality, facing, parking, power backup, availability, and 13 full-size photo URLs on `imagecdn.99acres.com`. It said carpet area was not listed instead of guessing. It gave no lat/long and no contact numbers. The reply was prose, so the real prompt must ask for JSON. Not done: the saved page HTML (step 2) and the housing.com test (step 5). Reply saved at `samples/claude-web-reply.txt`.
