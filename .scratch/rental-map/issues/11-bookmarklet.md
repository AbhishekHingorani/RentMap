# Check what a bookmarklet can read from a listing page

Type: research
Status: resolved
Blocked by: 09

## Question

Saved page: `samples/2 BHK _ Bedroom Apartment _ Flat for rent in Ahad Excellencia Chikkanayakanahalli Near Sarjapur Road Bangalore - 1160 Sqft- 4th floor (out of 4).html`. Claude web read the link alone in the one test, so the bookmarklet is the fallback path only.


Using the saved pages in `/Users/abhishekhingorani/Abhishek/rentalSelector/samples/`: what can a bookmarklet read? Look for the listing fields, photo URLs, and lat/long (for example in embedded JSON like `__NEXT_DATA__` or `application/ld+json`). Check whether the sites' Content Security Policy blocks bookmarklets in Chrome and Safari, and whether a bookmarklet can copy text to the clipboard on these pages. Note how large the page text is, since it goes into a prompt.

Research findings: research/bookmarklet.md

## Resolution

Facts only. The choices these facts suggest are picks for [Decide the add-by-link flow](07-add-by-link-flow.md).

- 99acres puts the listing data in `window.__initialData__.pd.pageData.propertyDetails.prop_data`. It has rent (`.Price`), BHK, super built-up area, furnishing, floor and total floors, society, locality, lat and long (`.Latitude`, `.Longitude`, as strings; the same pair is in the ld+json `geo`), and masked contacts.
- The 13 full-size photo links are at `pd.pageData.galleryDetails.pdGalleryData.property.images[i].variants.O`. They match the links Claude web gave.
- No `__NEXT_DATA__`. The ld+json blocks have fewer fields.
- The page text is 10,830 characters (about 2,700 tokens). A trimmed JSON object is about 3,000 characters.
- The site changes pages without a reload. `__initialData__` may hold an earlier page, so check `.Prop_Id` against the URL.
- CSP: Chromium source turns the page's CSP check off for bookmarklets, so Chrome runs them. WebKit checks CSP for `javascript:` URLs. 99acres uses inline scripts with no nonces, so its CSP likely allows Safari too. Live headers returned 403, so this needs a live test.
- Clipboard: Chrome counts the bookmark click as a user action, so `navigator.clipboard.writeText` should work. Safari likely blocks it. Safe fallback: show the text in a box on the page with a Copy button, since that click is a real user action.
- No housing.com sample exists, so nothing here covers housing.com.

Live checks moved to [Test the bookmarklet live in Chrome and Safari](12-bookmarklet-live-test.md).
