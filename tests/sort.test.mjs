import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
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
    ["price", "area", "bhk", "our-rating", "other-ratings", "locality", "distance-0"],
  );
  assert.deepEqual(ids("distance-1"), ids("price"));
});
