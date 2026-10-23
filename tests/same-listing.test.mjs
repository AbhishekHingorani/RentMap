import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
import {
  dayText,
  linkKey,
  maybeMatchMessage,
  maybeMatches,
  sureMatch,
  sureMatchMessage,
} from "../public/lib/same-listing.mjs";

const LINK = "https://www.99acres.com/2-bhk-flat-for-rent-in-ahad-excellencia-spid-M93900012";

function saved(over = {}) {
  return {
    "Listing id": "L-1",
    "Society / building name": "Ahad Excellencia",
    Configuration: "2BHK",
    Status: "To call",
    "Rent (₹/month)": 38999,
    "Floor / total floors": "4 of 4",
    "Listing link": LINK,
    "Date added": "2026-10-20",
    "Added by": "Asha",
    ...over,
  };
}

test("the 99acres key is the spid- part of the link", () => {
  assert.equal(linkKey(LINK), "M93900012");
  assert.equal(linkKey("https://99acres.com/other-words-spid-M93900012?src=share#photos"), "M93900012");
});

test("two 99acres links for one flat have the same key", () => {
  assert.equal(linkKey(LINK), linkKey("https://www.99acres.com/rent-ahad-spid-M93900012?from=app"));
});

test("another site's key is the link without its ? and # tail", () => {
  assert.equal(linkKey("https://housing.com/rent/123-flat?utm=x#top"), "https://housing.com/rent/123-flat");
  assert.equal(linkKey("https://housing.com/rent/123-flat#top"), "https://housing.com/rent/123-flat");
});

test("a spid- in a link from another site is not a 99acres key", () => {
  assert.equal(linkKey("https://example.com/spid-M93900012"), "https://example.com/spid-M93900012");
});

test("a 99acres link with no spid- part keeps the whole link, less its tail", () => {
  assert.equal(linkKey("https://www.99acres.com/search?city=1"), "https://www.99acres.com/search");
});

test("no link has no key", () => {
  assert.equal(linkKey(""), null);
  assert.equal(linkKey("  "), null);
  assert.equal(linkKey(undefined), null);
});

test("a sure match finds the saved listing with the same key, Rejected ones too", () => {
  const listings = listingsFromRows([saved({ Status: "Rejected" })]);
  assert.equal(sureMatch(listings, "https://www.99acres.com/x-spid-M93900012?share=1")?.id, "L-1");
  assert.equal(sureMatch(listings, "https://www.99acres.com/x-spid-M11111111"), null);
});

test("a saved listing with no link never makes a sure match", () => {
  const listings = listingsFromRows([saved({ "Listing link": "" })]);
  assert.equal(sureMatch(listings, LINK), null);
  assert.equal(sureMatch(listings, ""), null);
});

test("the sure-match message names the society, who added it and when", () => {
  const [listing] = listingsFromRows([saved()]);
  assert.equal(sureMatchMessage(listing), "Already on the map: Ahad Excellencia, added by Asha on 2026-10-20.");
});

test("the sure-match message names the Rejected Status", () => {
  const [listing] = listingsFromRows([saved({ Status: "Rejected" })]);
  assert.equal(sureMatchMessage(listing), "Already on the map (Rejected): Ahad Excellencia, added by Asha on 2026-10-20.");
});

test("the sure-match message says not given for a missing name or date", () => {
  const [listing] = listingsFromRows([saved({ "Added by": "", "Date added": "" })]);
  assert.equal(sureMatchMessage(listing), "Already on the map: Ahad Excellencia, added by not given on not given.");
});

test("a maybe-match has the same society, any case, and the same Configuration", () => {
  const listings = listingsFromRows([
    saved(),
    saved({ "Listing id": "L-2", Configuration: "3BHK" }),
    saved({ "Listing id": "L-3", "Society / building name": "Other Towers" }),
    saved({ "Listing id": "L-4", Status: "Rejected", "Rent (₹/month)": 50000 }),
  ]);
  const found = maybeMatches(listings, { society: "  ahad EXCELLENCIA ", configuration: "2 BHK" }, "L-new");
  assert.deepEqual(
    found.map((l) => l.id),
    ["L-1", "L-4"],
  );
});

test("the maybe-match skips the new listing itself, and a listing with no society matches none", () => {
  const listings = listingsFromRows([saved(), saved({ "Listing id": "L-2", "Society / building name": "" })]);
  assert.deepEqual(maybeMatches(listings, { society: "Ahad Excellencia", configuration: "2BHK" }, "L-1"), []);
  assert.deepEqual(maybeMatches(listings, { society: "", configuration: "2BHK" }, "L-new"), []);
});

test("the maybe-match message names society, Configuration, rent and floor", () => {
  const [listing] = listingsFromRows([saved()]);
  assert.equal(maybeMatchMessage(listing), "This might be the same as: Ahad Excellencia, 2BHK, ₹38,999, 4 of 4.");
  const [rejected] = listingsFromRows([saved({ Status: "Rejected", "Rent (₹/month)": "", "Floor / total floors": "" })]);
  assert.equal(maybeMatchMessage(rejected), "This might be the same as (Rejected): Ahad Excellencia, 2BHK, not given, not given.");
});

test("a hand-typed rejected Status and 2 BHK Configuration still count", () => {
  const listings = listingsFromRows([saved({ Status: " rejected ", Configuration: "2 BHK" })]);
  assert.deepEqual(
    maybeMatches(listings, { society: "Ahad Excellencia", configuration: "2BHK" }, "L-new").map((l) => l.id),
    ["L-1"],
  );
  assert.match(sureMatchMessage(listings[0]), /^Already on the map \(Rejected\): /);
});

test("a date the sheet sends back as a UTC timestamp shows as the local day", () => {
  const stamp = new Date(2026, 9, 20).toISOString();
  assert.equal(dayText(stamp), "2026-10-20");
  assert.equal(dayText("2026-10-20"), "2026-10-20");
  assert.equal(dayText(""), "");
  const [listing] = listingsFromRows([saved({ "Date added": stamp })]);
  assert.equal(sureMatchMessage(listing), "Already on the map: Ahad Excellencia, added by Asha on 2026-10-20.");
});
