import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
import {
  CLASH,
  ROW_GONE,
  addItem,
  cellChange,
  itemProblem,
  ratingAfterClick,
  ratingValue,
  refusalMessage,
  removeItem,
  personRatingFrom,
} from "../public/lib/our-take.mjs";

test("a save sends one cell with the value the person saw", () => {
  const [listing] = listingsFromRows([{ "Listing id": "L1", Status: "To call", Safety: 4 }]);
  assert.deepEqual(cellChange(listing, "Status", "Visited"), { column: "Status", old: "To call", new: "Visited" });
  assert.deepEqual(cellChange(listing, "Safety", 5), { column: "Safety", old: 4, new: 5 });
  assert.deepEqual(cellChange(listing, "Location", 3), { column: "Location", old: "", new: 3 });
});

test("a click on the rating the listing has now clears it", () => {
  assert.equal(ratingAfterClick(4, 4), "");
  assert.equal(ratingAfterClick(4, 2), 2);
  assert.equal(ratingAfterClick(null, 5), 5);
});

test("ratingValue reads 1 to 5 and hand-typed ratings, and nothing else", () => {
  assert.equal(ratingValue(3), 3);
  assert.equal(ratingValue(" 4 "), 4);
  assert.equal(ratingValue(""), null);
  assert.equal(ratingValue(6), null);
  assert.equal(ratingValue(2.5), null);
});

test("addItem puts the item at the end, and removeItem takes out one match", () => {
  assert.equal(addItem("", "Quiet street"), "Quiet street");
  assert.equal(addItem("Quiet street", " Big balcony "), "Quiet street; Big balcony");
  assert.equal(removeItem("Quiet street; Big balcony", "Quiet street"), "Big balcony");
  assert.equal(removeItem("Lift; Lift; Gym", "Lift"), "Lift; Gym");
});

test("removing an item that is already gone leaves the cell as it is", () => {
  assert.equal(removeItem("Big balcony", "Quiet street"), "Big balcony");
  assert.equal(removeItem("", "Quiet street"), "");
});

test("a pro or con must have text and no ;", () => {
  assert.equal(itemProblem("Pros", "  "), "Type a pro first.");
  assert.equal(itemProblem("Cons", "Noisy; old"), 'A con cannot hold a ";". The sheet uses ";" to split the items.');
  assert.equal(itemProblem("Pros", "Quiet street"), "");
});

test("a refused click names the cell and the sheet value", () => {
  const clash = { ok: false, error: CLASH, clashes: ["Status"], listing: { Status: "Visited" } };
  assert.equal(refusalMessage(clash), "Someone changed Status to Visited. Your change was not saved.");
  const cleared = { ok: false, error: CLASH, clashes: ["Safety"], listing: { Safety: "" } };
  assert.equal(refusalMessage(cleared), "Someone cleared Safety. Your change was not saved.");
  assert.equal(refusalMessage({ ok: false, error: ROW_GONE }), "This listing is no longer in the sheet.");
  assert.match(refusalMessage({ ok: false, error: "busy" }), /busy/);
});

test("a person rating is 0 to 10 in steps of 0.5, and an empty box clears it", () => {
  assert.equal(personRatingFrom("7.5"), 7.5);
  assert.equal(personRatingFrom("0"), 0);
  assert.equal(personRatingFrom("10"), 10);
  assert.equal(personRatingFrom("  "), "");
  assert.equal(personRatingFrom("10.5"), null);
  assert.equal(personRatingFrom("7.25"), null);
  assert.equal(personRatingFrom("-1"), null);
  assert.equal(personRatingFrom("abc"), null);
});
