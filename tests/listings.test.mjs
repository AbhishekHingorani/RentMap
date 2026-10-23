import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costRange,
  formatOurRating,
  formatRupees,
  ratingsText,
  furnishingKind,
  isTicked,
  listingSource,
  pinLabel,
  listingsFromRows,
  sortByCost,
  settingsFromRows,
} from "../public/lib/listings.mjs";

test("money shows in Indian digit groups", () => {
  assert.equal(formatRupees(117000), "₹1,17,000");
  assert.equal(formatRupees(38999), "₹38,999");
  assert.equal(formatRupees(950), "₹950");
  assert.equal(formatRupees(12500000), "₹1,25,00,000");
  assert.equal(formatRupees(null), "not given");
});

test("a pin shows total cost in thousands and the Configuration", () => {
  const row = { "Total monthly cost": 38000, Configuration: "2BHK" };
  assert.equal(pinLabel(listingsFromRows([row])[0]), "₹38k · 2BHK");
  const odd = { "Total monthly cost": 41500, Configuration: "3BHK" };
  assert.equal(pinLabel(listingsFromRows([odd])[0]), "₹41.5k · 3BHK");
  const noCost = { Configuration: "1BHK" };
  assert.equal(pinLabel(listingsFromRows([noCost])[0]), "1BHK");
});

test("total cost falls back to rent plus maintenance when the cell is empty", () => {
  const [both, rentOnly, typed] = listingsFromRows([
    { "Rent (₹/month)": 38000, "Maintenance (₹/month)": 3000, "Total monthly cost": "" },
    { "Rent (₹/month)": 25000, "Maintenance (₹/month)": "" },
    { "Rent (₹/month)": "38,999", "Total monthly cost": "" },
  ]);
  assert.equal(both.totalCost, 41000);
  assert.equal(rentOnly.totalCost, 25000);
  assert.equal(typed.totalCost, 38999);
});

test("the list is sorted by total cost, lowest first, and no rent goes last", () => {
  const listings = listingsFromRows([
    { "Listing id": "a", "Rent (₹/month)": "", "Total monthly cost": "" },
    { "Listing id": "b", "Rent (₹/month)": 50000, "Total monthly cost": 52000 },
    { "Listing id": "c", "Rent (₹/month)": 30000, "Total monthly cost": 31000 },
    { "Listing id": "d", "Rent (₹/month)": 40000, "Total monthly cost": 40000 },
  ]);
  assert.deepEqual(
    sortByCost(listings).map((l) => l.id),
    ["c", "d", "b", "a"],
  );
});

test("a listing gets a map spot only when Lat and Long are numbers", () => {
  const [placed, missing] = listingsFromRows([
    { Lat: 12.9, Long: 77.7 },
    { Lat: "", Long: 77.7 },
  ]);
  assert.deepEqual(placed.spot, [12.9, 77.7]);
  assert.equal(missing.spot, null);
});

test("photo is the first link in the Photos cell", () => {
  const [listing] = listingsFromRows([{ Photos: " https://a/1.jpg ; https://a/2.jpg" }]);
  assert.equal(listing.photo, "https://a/1.jpg");
});

test("Settings rows become a name to value map", () => {
  const settings = settingsFromRows([{ Setting: "Budget (₹/month)", Value: 45000 }]);
  assert.equal(settings["Budget (₹/month)"], 45000);
});

test("the source of a listing is the site in its link", () => {
  assert.equal(listingSource("https://www.99acres.com/x-spid-M93900012").key, "99acres");
  assert.equal(listingSource("https://housing.com/rent/21267780-flat").label, "Housing.com");
  assert.deepEqual(listingSource("https://www.nobroker.in/property/1"), { key: "other", label: "nobroker.in" });
  assert.equal(listingSource("https://not99acres.com/x").key, "other");
  assert.equal(listingSource(""), null);
  assert.equal(listingSource("javascript:alert(1)"), null);
});

test("furnishing reads as full, semi or none, hand-typed ones too", () => {
  assert.equal(furnishingKind("Fully furnished"), "full");
  assert.equal(furnishingKind("Furnished"), "full");
  assert.equal(furnishingKind("Semi-furnished"), "semi");
  assert.equal(furnishingKind("semi furnished"), "semi");
  assert.equal(furnishingKind("Unfurnished"), "none");
  assert.equal(furnishingKind(""), null);
  assert.equal(furnishingKind("ask owner"), null);
});

test("the Shortlisted box reads a sheet boolean, or a hand-typed yes or TRUE", () => {
  assert.equal(isTicked(true), true);
  assert.equal(isTicked(false), false);
  assert.equal(isTicked("TRUE"), true);
  assert.equal(isTicked(" yes "), true);
  assert.equal(isTicked(""), false);
  assert.equal(isTicked("FALSE"), false);
  assert.equal(listingsFromRows([{ Shortlisted: true }])[0].shortlisted, true);
  assert.equal(listingsFromRows([{ Status: "Shortlisted" }])[0].shortlisted, false);
});

test("our rating is the average of Dimple's and Abhishek's filled ratings, out of 10", () => {
  const [both] = listingsFromRows([{ "Dimple's rating": 7.5, "Abhishek's rating": "9" }]);
  assert.equal(both.ourRating, 8.25);
  assert.equal(formatOurRating(both.ourRating), "8.25 / 10");
  const [one] = listingsFromRows([{ "Dimple's rating": 0 }]);
  assert.equal(one.ourRating, 0);
  const [none] = listingsFromRows([{ "Overall rating": 3.4 }]);
  assert.equal(none.ourRating, null);
  assert.equal(ratingsText(none), "Ours not given · Others 3.4 / 5");
});

test("the cost range spans every listing with a cost", () => {
  const listings = listingsFromRows([{ "Total monthly cost": 30000 }, { "Total monthly cost": 52000 }, {}]);
  assert.deepEqual(costRange(listings), { min: 30000, max: 52000 });
  assert.equal(costRange(listingsFromRows([{}])), null);
});
