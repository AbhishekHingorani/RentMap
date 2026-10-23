import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
import { distanceScore, distanceScorer } from "../public/lib/places.mjs";
import { sortChoices, sortListings } from "../public/lib/sort.mjs";

const rows = [
  { "Listing id": "a", Locality: "whitefield", "Total monthly cost": 40000, Configuration: "3BHK", "Carpet area (sq ft)": 1500, "Dimple's rating": 6, "Overall rating": 4, Lat: 12.9, Long: 77.7 },
  { "Listing id": "b", Locality: "Bellandur", "Total monthly cost": 30000, Configuration: "1BHK", "Super built-up area (sq ft)": 700, "Overall rating": 2, Lat: 12.95, Long: 77.75 },
  { "Listing id": "c", Locality: "Whitefield", Configuration: "2 bhk", "Dimple's rating": 9 },
  { "Listing id": "d", "Total monthly cost": 35000, Configuration: "", "Carpet area (sq ft)": 1100, Lat: 12.91, Long: 77.7 },
];
const listings = listingsFromRows(rows);
const places = [{ name: "Office", spot: [12.9, 77.7] }, { name: "No spot", spot: null }];
const ids = (value) => sortListings(listings, value, places).map((l) => l.id);

test("each sort puts missing values last and keeps their order", () => {
  assert.deepEqual(ids("price"), ["b", "d", "a", "c"]);
  assert.deepEqual(ids("area"), ["a", "d", "b", "c"]);
  assert.deepEqual(ids("bhk"), ["b", "c", "a", "d"]);
  assert.deepEqual(ids("our-rating"), ["c", "a", "b", "d"]);
  assert.deepEqual(ids("other-ratings"), ["a", "b", "c", "d"]);
  assert.deepEqual(ids("distance-0"), ["a", "d", "b", "c"]);
  assert.deepEqual(ids("locality"), ["b", "a", "c", "d"]);
});

test("a place with no map spot gets no distance choice, and an unknown choice sorts by price", () => {
  assert.deepEqual(
    sortChoices(places).map((c) => c.value),
    ["price", "area", "bhk", "our-rating", "other-ratings", "locality", "distance-score", "distance-0"],
  );
  assert.deepEqual(ids("distance-1"), ids("price"));
});

test("the distance score is 10 for the nearest listing to every place and 0 for the farthest", () => {
  const two = [
    { name: "Office", spot: [12.9, 77.7] },
    { name: "Gym", spot: [12.95, 77.75] },
  ];
  const scoreOf = distanceScorer(listings, two);
  // a sits on Office and d is next to it. b sits on Gym. c has no map spot.
  assert.equal(scoreOf(listings.find((l) => l.id === "c")), null);
  const a = scoreOf(listings.find((l) => l.id === "a"));
  const b = scoreOf(listings.find((l) => l.id === "b"));
  assert.ok(a >= 0 && a <= 10 && b >= 0 && b <= 10);
  assert.equal(a + b, 10);
  assert.equal(distanceScore(listings[0], [{ name: "No spot", spot: null }], [null]), null);
  // One place: the nearest gets 10 and the farthest 0.
  const office = distanceScorer(listings, [two[0]]);
  assert.equal(office(listings[0]), 10);
  assert.equal(office(listings[1]), 0);
  assert.deepEqual(sortListings(listings, "distance-score", two, scoreOf).at(-1).id, "c");
});
