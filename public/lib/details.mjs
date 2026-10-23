// What the listing details view shows, from "Screen > Listing details" in SPEC.md. No DOM here.
import { TRACKER_COLUMNS } from "./columns.mjs";
import { NOT_GIVEN, formatRating, formatRupees, toNumber, toText } from "./listings.mjs";

const MONEY_COLUMNS = new Set([
  "Rent (₹/month)",
  "Maintenance (₹/month)",
  "Total monthly cost",
  "Deposit",
  "Brokerage fee",
]);

// The value of one Tracker column as the screen shows it.
export function fieldText(listing, column) {
  // These two can be worked out before the Apps Script writes them, so show the same value as the card.
  if (column === "Total monthly cost") return formatRupees(listing.totalCost);
  if (column === "Overall rating") return formatRating(listing.overallRating);

  const raw = listing.row[column];
  if (MONEY_COLUMNS.has(column)) {
    const amount = toNumber(raw);
    if (amount !== null) return formatRupees(amount);
  }
  return toText(raw) || NOT_GIVEN;
}

export function allFields(listing) {
  return TRACKER_COLUMNS.map((column, index) => ({
    number: index + 1,
    column,
    value: fieldText(listing, column),
  }));
}

// A society or locality pin is only near the home, so the map draws a dashed circle round it.
export function isRoughPin(listing) {
  return listing.precision === "society" || listing.precision === "locality";
}

export function photoLinks(listing) {
  return toText(listing.row.Photos)
    .split(";")
    .map((link) => link.trim())
    .filter(Boolean);
}
