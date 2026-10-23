# Find a free way to turn an Indian address into a map spot

Type: research
Status: resolved
Blocked by: none

## Question

When a listing has no lat/long, how does the server turn a locality or address in India into lat/long for free? Check OpenStreetMap Nominatim: usage limits, required User-Agent, accuracy for Indian localities and societies. Name one fallback if Nominatim fails.

Research findings: research/geocoding.md

## Resolution

Use Nominatim on the server only, through one queue at 1 request per second, with a named User-Agent and a cache (misses included). Query order: "society, city", then "locality, city", then Photon (photon.komoot.io) biased to the city. Always pass `countrycodes=in` and a city `viewbox`. Save a precision tag (building, society, locality) with each point so the app can mark rough pins. Details: research/geocoding.md.
