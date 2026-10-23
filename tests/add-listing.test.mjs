import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPLY_COLUMNS,
  dateText,
  fieldProblems,
  fixValue,
  listingLink,
  newListingRow,
  pageSpot,
  readReply,
  reviewFields,
  stepOnePrompt,
} from "../public/lib/add-listing.mjs";
import { TRACKER_COLUMNS } from "../public/lib/columns.mjs";

const LINK = "https://www.99acres.com/2-bhk-flat-for-rent-in-ahad-excellencia-spid-M93900012";

// A reply in the shape the step 1 prompt asks for, with two values in the wrong format.
const REPLY_TEXT = `Here is the listing.

\`\`\`json
{
  "society": "Ahad Excellencia",
  "locality": "Chikkanayakanahalli",
  "configuration": "2 BHK",
  "listedBy": "Dealer",
  "brokerName": null,
  "rent": "38,999",
  "maintenance": null,
  "deposit": 117000,
  "brokerage": null,
  "carpetArea": null,
  "superArea": 1160,
  "bathrooms": 2,
  "floor": "4 of 4",
  "furnishing": "Semi-furnished",
  "parking": "Yes",
  "lift": null,
  "availableFrom": "Immediately",
  "otherDetails": "East facing; full power backup",
  "photos": ["https://imagecdn.99acres.com/media1/41417/2/828342725O-1787988609938.jpg", "https://imagecdn.99acres.com/media1/41417/2/828342709O-1787988602450.jpg"],
  "lat": null,
  "long": null
}
\`\`\``;

test("the step 1 prompt holds the link and every fixed key", () => {
  const prompt = stepOnePrompt(LINK);
  assert.ok(prompt.startsWith(`Open this rental listing: ${LINK}\n`));
  for (const key of Object.keys(REPLY_COLUMNS)) assert.match(prompt, new RegExp(`\\b${key}\\b`), key);
  assert.match(prompt, /\{"error": "could_not_read"\}/);
});

test("each reply key maps to a real Tracker column, and none of them is a rating", () => {
  for (const column of Object.values(REPLY_COLUMNS)) assert.ok(TRACKER_COLUMNS.includes(column), column);
  for (const rating of ["Safety", "Water supply", "Location", "Condition", "Natural light"]) {
    assert.ok(!Object.values(REPLY_COLUMNS).includes(rating));
  }
});

test("only an http or https link counts as a listing link", () => {
  assert.equal(listingLink(`  ${LINK} `), LINK);
  assert.equal(listingLink("javascript:alert(1)"), null);
  assert.equal(listingLink("99acres.com/flat"), null);
  assert.equal(listingLink(""), null);
});

test("the app reads the ```json block of Claude's reply", () => {
  const read = readReply(REPLY_TEXT);
  assert.equal(read.ok, true);
  assert.equal(read.reply.society, "Ahad Excellencia");
});

test("a bare JSON object with no block also reads", () => {
  assert.equal(readReply('{"rent": 20000, "locality": null}').ok, true);
});

test("a could_not_read reply fails with a clear message", () => {
  assert.deepEqual(readReply('```json\n{"error": "could_not_read"}\n```'), {
    ok: false,
    error: "Claude could not read the listing page.",
  });
  assert.equal(readReply('{"error": "could_not_read"}').ok, false);
});

test("a reply with no rent and no locality fails", () => {
  const read = readReply('```json\n{"society": "Ahad", "rent": null, "locality": " "}\n```');
  assert.equal(read.ok, false);
  assert.match(read.error, /no rent and no locality/);
  // One of the two is enough.
  assert.equal(readReply('{"rent": null, "locality": "HSR Layout"}').ok, true);
  assert.equal(readReply('{"rent": 0, "locality": null}').ok, true);
});

test("a reply with no JSON, or JSON that is not an object, fails", () => {
  for (const text of ["Sorry, I cannot help.", "```json\n[1, 2]\n```", "```json\n{broken\n```", ""]) {
    const read = readReply(text);
    assert.equal(read.ok, false, text);
    assert.match(read.error, /no JSON/);
  }
});

test("a value in the wrong format is fixed and marked", () => {
  assert.deepEqual(fixValue("configuration", "2 BHK"), { value: "2BHK", fixed: true });
  assert.deepEqual(fixValue("configuration", "1 rk"), { value: "1RK", fixed: true });
  assert.deepEqual(fixValue("configuration", "5 BHK"), { value: "4BHK+", fixed: true });
  assert.deepEqual(fixValue("rent", "38,999"), { value: 38999, fixed: true });
  assert.deepEqual(fixValue("rent", "₹38,999"), { value: 38999, fixed: true });
  assert.deepEqual(fixValue("furnishing", "semi furnished"), { value: "Semi-furnished", fixed: true });
  assert.deepEqual(fixValue("furnishing", "Furnished"), { value: "Fully furnished", fixed: true });
  assert.deepEqual(fixValue("listedBy", "owner"), { value: "Owner", fixed: true });
  assert.deepEqual(fixValue("listedBy", "Broker"), { value: "Dealer", fixed: true });
  assert.deepEqual(fixValue("parking", true), { value: "Yes", fixed: true });
  assert.deepEqual(fixValue("lift", "no"), { value: "No", fixed: true });
  assert.deepEqual(fixValue("floor", 4), { value: "4", fixed: true });
  assert.deepEqual(fixValue("lat", "12.91"), { value: 12.91, fixed: true });
});

test("a value in the right format is not marked", () => {
  assert.deepEqual(fixValue("configuration", "2BHK"), { value: "2BHK", fixed: false });
  assert.deepEqual(fixValue("rent", 38999), { value: 38999, fixed: false });
  assert.deepEqual(fixValue("furnishing", "Semi-furnished"), { value: "Semi-furnished", fixed: false });
  assert.deepEqual(fixValue("parking", "Yes"), { value: "Yes", fixed: false });
  assert.deepEqual(fixValue("society", "Ahad Excellencia"), { value: "Ahad Excellencia", fixed: false });
  assert.deepEqual(fixValue("rent", null), { value: "", fixed: false });
});

test("a value the app cannot fix stays as it came, unmarked, for the person to fix", () => {
  assert.deepEqual(fixValue("configuration", "Studio"), { value: "Studio", fixed: false });
  assert.deepEqual(fixValue("rent", "ask the owner"), { value: "ask the owner", fixed: false });
});

test("short money like 38k or 1.17 lakh is fixed", () => {
  assert.deepEqual(fixValue("rent", "38k"), { value: 38000, fixed: true });
  assert.deepEqual(fixValue("deposit", "₹1.17 lakh"), { value: 117000, fixed: true });
  assert.deepEqual(fixValue("deposit", "2 lakhs"), { value: 200000, fixed: true });
  assert.deepEqual(fixValue("rent", "38 apples"), { value: "38 apples", fixed: false });
});

test("Save is refused for a value the app cannot fix", () => {
  assert.deepEqual(fieldProblems({ rent: "on request", configuration: "Studio", parking: "Yes", lift: "" }), [
    "Configuration must be one of: 1RK, 1BHK, 2BHK, 3BHK, 4BHK+.",
    "Rent (₹/month) must be a number.",
  ]);
  assert.deepEqual(fieldProblems({ rent: "38,999", configuration: "2 bhk", society: "Anything" }), []);
});

test("site photo links are kept as they are, split by ;", () => {
  const links = ["https://imagecdn.99acres.com/a.jpg", "https://imagecdn.99acres.com/b.jpg"];
  assert.deepEqual(fixValue("photos", links), { value: links.join("; "), fixed: false });
  assert.deepEqual(fixValue("photos", []), { value: "", fixed: false });
});

test("the review form has one field per reply key, with the fixed ones marked", () => {
  const fields = reviewFields(readReply(REPLY_TEXT).reply);
  assert.equal(fields.length, Object.keys(REPLY_COLUMNS).length);
  const marked = fields.filter((f) => f.fixed).map((f) => f.key);
  assert.deepEqual(marked, ["configuration", "rent"]);
  assert.equal(fields.find((f) => f.key === "rent").column, "Rent (₹/month)");
});

test("the new row has Status To call, the link, the date, the name and the id", () => {
  const values = Object.fromEntries(reviewFields(readReply(REPLY_TEXT).reply).map((f) => [f.key, String(f.value)]));
  const spot = { lat: 12.9, long: 77.7, precision: "society" };
  const row = newListingRow({ id: "L-1", values, link: LINK, addedBy: "Asha", today: "2026-10-23", spot });

  assert.equal(row["Listing id"], "L-1");
  assert.equal(row.Status, "To call");
  assert.equal(row["Listing link"], LINK);
  assert.equal(row["Date added"], "2026-10-23");
  assert.equal(row["Added by"], "Asha");
  assert.equal(row.Configuration, "2BHK");
  assert.equal(row["Rent (₹/month)"], 38999);
  assert.equal(row.Deposit, 117000);
  assert.equal(row["Maintenance (₹/month)"], "");
  assert.equal(row.Lat, 12.9);
  assert.equal(row.Long, 77.7);
  assert.equal(row["Pin precision"], "society");
  for (const column of Object.keys(row)) assert.ok(TRACKER_COLUMNS.includes(column), column);
  assert.ok(!("Total monthly cost" in row) && !("Overall rating" in row));
});

test("a typed value in the review form is fixed again at save", () => {
  const row = newListingRow({ id: "L-2", values: { configuration: "3 bhk", rent: "₹45,000" }, link: "", addedBy: "Ravi", today: "2026-10-23", spot: null });
  assert.equal(row.Configuration, "3BHK");
  assert.equal(row["Rent (₹/month)"], 45000);
  assert.equal(row.Lat, "");
  assert.equal(row["Pin precision"], "");
});

test("the page spot is used only when both lat and long are given", () => {
  assert.deepEqual(pageSpot({ lat: "12.91", long: "77.68" }), { lat: 12.91, long: 77.68, precision: "building" });
  assert.equal(pageSpot({ lat: "12.91", long: "" }), null);
  assert.equal(pageSpot({}), null);
});

test("Date added is the local date as YYYY-MM-DD", () => {
  assert.equal(dateText(new Date(2026, 9, 3, 23, 30)), "2026-10-03");
});
