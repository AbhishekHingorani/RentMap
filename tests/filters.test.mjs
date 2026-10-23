import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
import {
  CONFIGURATIONS,
  budgetFrom,
  SCORE_CHOICES,
  SHORTLIST_CHOICES,
  filterListings,
  isOverBudget,
  priceChoices,
  startFilters,
  startPriceChoice,
} from "../public/lib/filters.mjs";

function one(row) {
  return listingsFromRows([row])[0];
}

function passes(row, changes = {}) {
  const filters = { ...startFilters(45000), ...changes };
  return filterListings([one(row)], filters).length === 1;
}

test("filters start at the Budget, every Configuration ticked, both switches off, no search", () => {
  const filters = startFilters(45000);
  assert.equal(filters.maxCost, 45000);
  assert.deepEqual([...filters.configurations].sort(), [...CONFIGURATIONS].sort());
  assert.deepEqual(CONFIGURATIONS, ["1RK", "1BHK", "2BHK", "3BHK", "4BHK+"]);
  assert.equal(filters.shortlistedOnly, false);
  assert.equal(filters.search, "");
});

test("the Budget comes from the Settings tab, and an empty Budget means no cap", () => {
  assert.equal(budgetFrom({ "Budget (₹/month)": 45000 }), 45000);
  assert.equal(budgetFrom({ "Budget (₹/month)": "₹45,000" }), 45000);
  assert.equal(budgetFrom({ "Budget (₹/month)": "" }), null);
  assert.equal(budgetFrom({}), null);
  assert.equal(startFilters(null).maxCost, null);
});

test("Max ₹/month checks Total monthly cost", () => {
  const row = { "Rent (₹/month)": 40000, "Maintenance (₹/month)": 6000, "Total monthly cost": 46000 };
  assert.equal(passes(row), false);
  assert.equal(passes(row, { maxCost: 46000 }), true);
});

test("Max ₹/month checks Rent alone when Maintenance is empty", () => {
  const row = { "Rent (₹/month)": 44000, "Maintenance (₹/month)": "", "Total monthly cost": 47000 };
  assert.equal(passes(row), true);
  assert.equal(passes(row, { maxCost: 43000 }), false);
});

test("a listing with no Rent passes Max ₹/month", () => {
  assert.equal(passes({ "Rent (₹/month)": "", "Total monthly cost": 90000 }, { maxCost: 1000 }), true);
});

test("an empty Max ₹/month lets every cost through", () => {
  assert.equal(passes({ "Rent (₹/month)": 900000, "Total monthly cost": 900000 }, { maxCost: null }), true);
});

test("Configuration hides a listing whose box is not ticked", () => {
  const row = { Configuration: "2BHK" };
  assert.equal(passes(row), true);
  assert.equal(passes(row, { configurations: new Set(["1BHK", "3BHK"]) }), false);
});

test("a listing with no Configuration stays in, because there is nothing to check", () => {
  assert.equal(passes({ Configuration: "" }, { configurations: new Set(["1BHK"]) }), true);
});

test("Shortlisted only keeps only listings with the Shortlisted box ticked", () => {
  assert.equal(passes({ Status: "Visited" }, { shortlistedOnly: true }), false);
  assert.equal(passes({ Status: "Visited", Shortlisted: false }, { shortlistedOnly: true }), false);
  assert.equal(passes({ Status: "Visited", Shortlisted: true }, { shortlistedOnly: true }), true);
  assert.equal(passes({ Status: "Visited" }), true);
});

test("an old Shortlisted Status with no ticked box is not shortlisted", () => {
  assert.equal(passes({ Status: "Shortlisted" }, { shortlistedOnly: true }), false);
});

test("the app does not use Status, so a Rejected listing still shows", () => {
  assert.equal(passes({ Status: "Rejected" }), true);
});

test("Search matches Society / building name and Locality, and case does not matter", () => {
  const row = { "Society / building name": "Prestige Lakeside", Locality: "Whitefield" };
  assert.equal(passes(row, { search: "lakeside" }), true);
  assert.equal(passes(row, { search: "WHITEFIELD" }), true);
  assert.equal(passes(row, { search: "  white " }), true);
  assert.equal(passes(row, { search: "Koramangala" }), false);
  assert.equal(passes({ Notes: "lakeside" }, { search: "lakeside" }), false);
});

test("Over budget means the total is above the Budget", () => {
  assert.equal(isOverBudget(one({ "Total monthly cost": 45001 }), 45000), true);
  assert.equal(isOverBudget(one({ "Total monthly cost": 45000 }), 45000), false);
  assert.equal(isOverBudget(one({ "Total monthly cost": "" }), 45000), false);
  assert.equal(isOverBudget(one({ "Total monthly cost": 90000 }), null), false);
});

test("a hand-typed Status still counts, whatever its case", () => {
  assert.equal(passes({ Shortlisted: "TRUE" }, { shortlistedOnly: true }), true);
});

test("the Price dropdown has the budget choice only when there is a Budget, then a step every 5k", () => {
  const listings = listingsFromRows([{ "Total monthly cost": 22000 }, { "Total monthly cost": 36000 }, {}]);
  const choices = priceChoices(45000, listings);
  assert.deepEqual(
    choices.map((c) => c.value),
    ["any", "budget", "up-to-25000", "up-to-30000", "up-to-35000"],
  );
  assert.equal(choices[1].label, "Within budget (₹45,000)");
  assert.deepEqual(choices[2], { value: "up-to-25000", label: "Up to ₹25k", maxCost: 25000 });
  assert.deepEqual(priceChoices(null, listings).map((c) => c.value).slice(0, 2), ["any", "up-to-25000"]);
  // A step on the cheapest price would keep nothing out, so it is left off.
  const even = listingsFromRows([{ "Total monthly cost": 30000 }, { "Total monthly cost": 40000 }]);
  assert.deepEqual(priceChoices(null, even).map((c) => c.value), ["any", "up-to-35000"]);
});

test("the Price dropdown starts at Within budget, or at Any price with no Budget, like startFilters", () => {
  assert.equal(startPriceChoice(45000), "budget");
  assert.equal(startPriceChoice(null), "any");
});

test("the score and shortlist dropdowns have fixed choices", () => {
  assert.deepEqual(SCORE_CHOICES.map((c) => c.minScore), [null, 5, 6, 7, 8]);
  assert.deepEqual(SHORTLIST_CHOICES.map((c) => c.shortlistedOnly), [false, true]);
});

test("price, score and shortlist filters work together", () => {
  const scores = { a: 8, b: 6, c: 4 };
  const scoreOf = (l) => scores[l.id] ?? null;
  const listings = listingsFromRows([
    { "Listing id": "a", "Rent (₹/month)": 24000, Shortlisted: true },
    { "Listing id": "b", "Rent (₹/month)": 24000 },
    { "Listing id": "c", "Rent (₹/month)": 20000, Shortlisted: true },
    { "Listing id": "d", "Rent (₹/month)": 30000, Shortlisted: true },
  ]);
  const shown = (changes) => filterListings(listings, { ...startFilters(null), ...changes }, scoreOf).map((l) => l.id);
  assert.deepEqual(shown({ maxCost: 25000, minScore: 5 }), ["a", "b"]);
  assert.deepEqual(shown({ maxCost: 25000, minScore: 5, shortlistedOnly: true }), ["a"]);
});

test("a distance score filter hides lower scores, and a listing with no score passes", () => {
  const scores = { a: 8.2, b: 4.9 };
  const scoreOf = (l) => scores[l.id] ?? null;
  const listings = listingsFromRows([{ "Listing id": "a" }, { "Listing id": "b" }, { "Listing id": "c" }]);
  const shown = filterListings(listings, { ...startFilters(null), minScore: 5 }, scoreOf).map((l) => l.id);
  assert.deepEqual(shown, ["a", "c"]);
});
