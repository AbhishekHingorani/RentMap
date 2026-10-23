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
