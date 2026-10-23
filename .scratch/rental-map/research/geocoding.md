# Geocoding Indian addresses for free

Ticket: issues/05-geocoding.md
Checked: 2026-10-23

## Question

When a listing has no lat/long, how does the server turn an Indian locality or address into lat/long for free? What are Nominatim's limits and User-Agent rules? How accurate is it for Indian localities and housing societies? What is one fallback?

## Nominatim usage policy (public server)

Source: https://operations.osmfoundation.org/policies/nominatim/

Read the full policy before using the public server. These are its main rules:

- At most 1 request per second. This is per app, so it covers all your users together.
- Send a valid User-Agent or HTTP Referer that names your app. A library's default User-Agent does not count.
- Show attribution. The data is ODbL, so the credit is "© OpenStreetMap contributors".
- Cache results on your side. Clients that send the same query over and over may be blocked.
- Bulk geocoding is discouraged. A small one-off bulk job is allowed on one thread and one machine. A job that runs more than a day, or runs on a schedule, must stay at 4 requests per minute.
- Client-side autocomplete is banned.
- Do not send personal data. A locality or society name is fine. A tenant's name or phone number is not.
- The app must let you switch the service off at OSMF's request without a software update. A config flag or env var covers this.
- The policy covers only nominatim.openstreetmap.org. OSMF can change it or withdraw access without notice.

## Nominatim search API

Source: https://nominatim.org/release-docs/latest/api/Search/

- Endpoint: `https://nominatim.openstreetmap.org/search`.
- Use free-form `q=` or the structured fields (`amenity`, `street`, `city`, `county`, `state`, `country`, `postalcode`). Do not mix the two.
- `countrycodes=in` is a hard filter to India.
- `viewbox=<lon1>,<lat1>,<lon2>,<lat2>` boosts results inside the box. Add `bounded=1` to make it a filter.
- `limit` defaults to 10, max 40.
- `format=jsonv2` returns `lat`, `lon`, `category`, `type`, `addresstype`, `place_rank`, `importance`, `boundingbox`, `display_name`.
- `place_rank` shows precision. In the tests below, 19 was a suburb, 24 was a residential area, and 30 was a single building or point.

## Sample queries

Run on 2026-10-23 with `countrycodes=in`, `limit=3`, a custom User-Agent, and at least 1.5 seconds between calls. Nine Nominatim calls in total.

| Query | Top result | Verdict |
| --- | --- | --- |
| `Baner, Pune` | 18.5590, 73.7845, place=suburb, rank 19 | Correct. Locality center. |
| `Amanora Park Town, Hadapsar, Pune` | No result | Miss. |
| `Amanora Park Town, Pune` | Amanora Future Towers, 18.5170, 73.9471, rank 30 | Close. A building inside the township, not the township itself. |
| `Blue Ridge, Hinjewadi, Pune` | No result | Miss. |
| `Blue Ridge, Pune` | Blue Ridge, landuse=residential, 18.5762, 73.7401, rank 24 | Correct. The society's own polygon. |
| `Magarpatta City, Pune` | "Yoo Pune", Mundhwa, 18.5206, 73.9278 | Wrong object. It is a nearby project, not Magarpatta. |

What this shows:

- Localities (suburb names) work well.
- Society names work only when someone has mapped them in OSM. Coverage is patchy.
- Extra parts in the query hurt. Adding "Hadapsar" or "Hinjewadi" turned two hits into zero. The OSM address tree for these places names a village or subdistrict ("Gopalpatti", "Mhalunge") and not the popular area name. Nominatim does not match the popular name.
- A society query can return a nearby but wrong object. Check `addresstype` and `place_rank`. Do not trust a result just because one came back.

## Fallback: Photon (komoot)

Sources: https://photon.komoot.io/ and https://github.com/komoot/photon/blob/master/docs/api-v1.md

- Free public server at `https://photon.komoot.io/api/`. It uses the same OSM data.
- The terms are informal. Keep requests "in a reasonable limit". Heavy use is throttled or banned. No uptime promise. No fixed rate number is given.
- Useful params: `q`, `lat`/`lon` for a location bias, `bbox=minLon,minLat,maxLon,maxLat`, `countrycode`, `layer` (house, street, locality, district, city, and others), `limit`.
- Photon is fuzzy and typo-tolerant, so it often returns something when Nominatim returns nothing.

Same queries on Photon, biased to central Pune:

| Query | Top result | Verdict |
| --- | --- | --- |
| `Baner, Pune` | Baner suburb, 18.5590, 73.7845 | Correct. Same point as Nominatim. |
| `Amanora Park Town, Hadapsar, Pune` | Dorabjees supermarket, Hadapsar, 18.5177, 73.9341 | Near, about 1 km off. A shop, not the society. |
| `Blue Ridge, Hinjewadi, Pune` | Symbiosis institute in Blue Ridge SEZ, 18.5816, 73.7345 | Near, a few hundred meters. Not the society itself. |

Photon gives an answer where Nominatim gives none, but the answer is often a nearby shop or road. Use it as a fallback, not as the first call.

## Recommendation

Use Nominatim first and Photon as the fallback. Both are free and both use OSM data.

1. Geocode on the server only, never from the browser. Send one request per second at most, through a single queue. Set a User-Agent like `rentalSelector/1.0 (contact email)`.
2. Cache every result in the database, keyed by the normalized query string. Cache misses too, so a failed query is not sent again.
3. Try queries from most to least specific, and stop at the first good hit:
   - `<society>, <city>` (drop the area name, since it often breaks the match)
   - `<locality>, <city>`
   - Photon with the full string and `lat`/`lon` set to the city center
4. Always send `countrycodes=in` and a `viewbox` around the city.
5. Store a precision tag with each point, read from `place_rank` or `addresstype`: "building", "society", or "locality". The UI can then mark locality-level points as approximate.
6. Show "© OpenStreetMap contributors" on any map or list that uses these points.
7. Put the geocoder behind a config switch, so it can be turned off without a code change.

Expect locality-level accuracy for most listings, roughly within 1 to 2 km. Expect society-level accuracy only when the society is in OSM. If the app later needs better society accuracy, a paid provider or a self-hosted Nominatim is the next step. That is out of scope for a free setup.
