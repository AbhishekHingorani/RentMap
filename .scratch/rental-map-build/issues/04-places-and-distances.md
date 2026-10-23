# Places, geocoding and distances

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T12:23:36Z
**Blocked by:** 02

## What to build

A person adds a place, like an office, by name and address. The local web server finds its map spot. A black star shows on the map. Every card and every listing's details show the straight-line distance to each place.

This ticket builds the geocoder. Ticket 05 uses it for new listings.

Spec: "The sheet > Places tab", "Map spots" and "Screen > Distances" in SPEC.md.

## Acceptance criteria

- [ ] The Places tab in the left column lists the places and has an "add a place" form.
- [ ] A new place is written to the Places tab with Name, Address, Lat, Long, Pin precision and Added by.
- [ ] The local web server geocodes. It sends at most 1 request per second, through one queue, with a User-Agent that names the app.
- [ ] Query order: Nominatim with society and city, then Nominatim with locality and city, then Photon biased to the city center. It stops at the first good hit.
- [ ] Every query passes `countrycodes=in` and a `viewbox` around the city.
- [ ] Each spot gets a Pin precision of building, society or locality, read from `place_rank` or `addresstype`.
- [ ] A config switch turns the geocoder off with no code change.
- [ ] Each place shows on the map as a black ★ with its name. Places always show, whatever the filters are.
- [ ] Cards and the Overview tab show the straight-line distance to each place. The app works it out live and stores nothing.

## Assumption

The owner said on 2026-10-23 to build on this assumption.

- **City for geocoding.** The Settings tab gets a second row: City. Its start value is Bangalore. The geocoder reads the city name from it and sets the `viewbox` and the Photon bias around that city.

## Acceptance criteria for the assumption

- [ ] The Settings tab has a City row with the value Bangalore.
- [ ] The geocoder reads the city from that row. No city name is written in the code.

## Open question for the owner

- **Edit or remove a place.** The spec does not say. Build add only until the owner decides.
