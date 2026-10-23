// Places and straight-line distances, from "The sheet > Places tab" and "Screen > Distances" in SPEC.md.
// The app works out each distance live and stores nothing. No DOM here, so tests can run it in Node.
import { NOT_GIVEN, toNumber, toText } from "./listings.mjs";

const CITY_SETTING = "City";
const EARTH_RADIUS_M = 6371000;

export function cityFrom(settings) {
  return toText(settings[CITY_SETTING]);
}

export function placesFromRows(rows) {
  return rows.map((row) => {
    const lat = toNumber(row.Lat);
    const long = toNumber(row.Long);
    return {
      name: toText(row.Name),
      address: toText(row.Address),
      spot: lat !== null && long !== null ? [lat, long] : null,
      precision: toText(row["Pin precision"]).toLowerCase(),
      addedBy: toText(row["Added by"]),
    };
  });
}

// The great-circle distance between two [lat, long] spots, in metres.
export function distanceM(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLong = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLong / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Under 1 km in steps of 50 m. Under 10 km with one decimal. Then whole km.
export function formatDistance(metres) {
  if (metres < 1000) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  if (metres < 10000) return `${(Math.round(metres / 100) / 10).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

// One entry per place, in Places tab order. A missing spot on either side reads "not given".
export function distancesFor(listing, places) {
  return places.map((place) => ({
    name: place.name || NOT_GIVEN,
    text: listing.spot && place.spot ? formatDistance(distanceM(listing.spot, place.spot)) : NOT_GIVEN,
  }));
}

// Coordinates typed by hand are exact, so they get the finest Pin precision.
export const TYPED_PIN_PRECISION = "building";
const BAD_COORDINATES = 'Write the coordinates as lat, long, like "23.0300, 72.5100". Google Maps shows them on a right-click.';

// Reads "23.03, 72.51" as typed or copied from Google Maps. A space works in place of the comma, and a degree sign
// is dropped. Returns { spot } or { error }.
export function parseCoordinates(text) {
  const match = toText(text)
    .replace(/°/g, "")
    .match(/^(-?\d+(?:\.\d+)?)\s*[NS]?\s*(?:,\s*|\s+)(-?\d+(?:\.\d+)?)\s*[EW]?$/i);
  if (!match) return { error: BAD_COORDINATES };
  const lat = Number(match[1]);
  const long = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(long) > 180) return { error: `${BAD_COORDINATES} Lat runs from -90 to 90, long from -180 to 180.` };
  return { spot: { lat, long, precision: TYPED_PIN_PRECISION } };
}

// A spot as the Coordinates box shows it.
export function coordinatesText(spot) {
  return spot ? `${spot[0]}, ${spot[1]}` : "";
}

// Where a place's map spot comes from. coordinates is the Coordinates box. For an edit, place is the saved place
// and the box starts with its spot. Returns { spot }, { geocode: true } or { error }.
// - A new or changed box gives the spot.
// - An empty box means: find it from the address.
// - An edit with the box as it started keeps the spot, unless the address changed or there is no spot.
export function spotPlan(coordinates, place = null, address = "") {
  const typed = toText(coordinates);
  if (!typed) return { geocode: true };
  if (!place || typed !== coordinatesText(place.spot)) return parseCoordinates(typed);
  const sameAddress = place.address.trim().toLowerCase() === address.trim().toLowerCase();
  if (place.spot && sameAddress) return { spot: { lat: place.spot[0], long: place.spot[1], precision: place.precision } };
  return { geocode: true };
}

// The editPlace call. Places have no id, so old holds what the person saw, and the Apps Script finds
// the row by it. spot is { lat, long, precision }.
export function editPlaceBody(place, name, address, spot) {
  return {
    action: "editPlace",
    old: { name: place.name, address: place.address, lat: place.spot ? place.spot[0] : "", long: place.spot ? place.spot[1] : "" },
    place: { name: name.trim(), address: address.trim(), lat: spot.lat, long: spot.long, precision: spot.precision },
  };
}

// After a refused or failed edit, the place in the sheet now that holds the edit, if the edit went in.
export function editedPlaceIn(places, place) {
  const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return (
    places.find(
      (p) => same(p.name, place.name) && same(p.address, place.address) && p.spot && p.spot[0] === place.lat && p.spot[1] === place.long,
    ) ?? null
  );
}

// For each place, the nearest and the farthest distance from any listing with a map spot, in metres.
export function distanceRanges(listings, places) {
  return places.map((place) => {
    const all = listings.filter((l) => l.spot && place.spot).map((l) => distanceM(l.spot, place.spot));
    return all.length ? { min: Math.min(...all), max: Math.max(...all) } : null;
  });
}

// Where a distance sits between the nearest (0) and the farthest (1) listing for that place.
export function distanceShare(metres, range) {
  if (!range || range.max === range.min) return 0;
  return Math.min(1, Math.max(0, (metres - range.min) / (range.max - range.min)));
}

// The colour hue for a share: 145 is green for the nearest, 25 is red for the farthest.
export function distanceHue(share) {
  return Math.round(145 - share * 120);
}

// One entry per place, like distancesFor, with the hue for its colour. A missing distance has no hue.
export function coloredDistances(listing, places, ranges) {
  return places.map((place, i) => {
    if (!listing.spot || !place.spot) return { name: place.name || NOT_GIVEN, text: NOT_GIVEN, hue: null };
    const metres = distanceM(listing.spot, place.spot);
    return { name: place.name || NOT_GIVEN, text: formatDistance(metres), hue: distanceHue(distanceShare(metres, ranges[i])) };
  });
}
