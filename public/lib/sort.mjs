// The "Sort by" choices for the list. No DOM here, so tests can run it in Node.
// Each choice puts listings with no value last. Ties keep the order they came in.
import { CONFIGURATIONS } from "./columns.mjs";
import { toNumber } from "./listings.mjs";
import { distanceM } from "./places.mjs";

const bhkRank = (listing) => {
  const at = CONFIGURATIONS.indexOf(listing.configuration.toUpperCase().replace(/\s+/g, ""));
  return at === -1 ? null : at;
};
// Carpet area, or Super built-up area when Carpet area is empty.
const areaOf = (listing) => toNumber(listing.row["Carpet area (sq ft)"]) ?? toNumber(listing.row["Super built-up area (sq ft)"]);

// key: the value to sort on, or null. up: true for smallest first.
const FIXED = [
  { value: "price", label: "Price: low to high", key: (l) => l.totalCost, up: true },
  { value: "area", label: "Area: big to small", key: areaOf, up: false },
  { value: "bhk", label: "BHK: small to big", key: bhkRank, up: true },
  { value: "our-rating", label: "Our rating: high to low", key: (l) => l.ourRating, up: false },
  { value: "other-ratings", label: "Other ratings: high to low", key: (l) => l.overallRating, up: false },
  { value: "locality", label: "Locality: A to Z", key: (l) => l.locality || null, up: true },
];

// Numbers by size. Text, like a locality, by the alphabet, so "whitefield" and "Whitefield" tie.
function compareKeys(a, b) {
  return typeof a === "string" ? a.localeCompare(b, "en", { sensitivity: "base" }) : a - b;
}

export const DEFAULT_SORT = "price";

// The fixed choices, then the distance score and "Distance from <place>" for each place with a map spot.
// scoreOf gives a listing's distance score, from distanceScorer in places.mjs.
export function sortChoices(places, scoreOf = () => null) {
  const near = places
    .map((place, i) => ({ place, i }))
    .filter(({ place }) => place.spot)
    .map(({ place, i }) => ({
      value: `distance-${i}`,
      label: `Distance from ${place.name}: near to far`,
      key: (l) => (l.spot ? distanceM(l.spot, place.spot) : null),
      up: true,
    }));
  const score = near.length ? [{ value: "distance-score", label: "Distance score: high to low", key: scoreOf, up: false }] : [];
  return [...FIXED, ...score, ...near];
}

export function sortListings(listings, value, places, scoreOf = () => null) {
  const choice = sortChoices(places, scoreOf).find((c) => c.value === value) ?? FIXED[0];
  const keyed = listings.map((listing, index) => ({ listing, index, key: choice.key(listing) }));
  keyed.sort((a, b) => {
    // Compare without Infinity, so two missing values tie and keep their order.
    if (a.key === null || b.key === null) return a.key === b.key ? a.index - b.index : a.key === null ? 1 : -1;
    const order = compareKeys(a.key, b.key);
    if (order === 0) return a.index - b.index;
    return choice.up ? order : -order;
  });
  return keyed.map((k) => k.listing);
}
